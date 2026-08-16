function env(){
  return {url:process.env.SUPABASE_URL,pub:process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY,secret:process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY};
}
function json(res,status,data){res.setHeader("Cache-Control","no-store");return res.status(status).json(data)}
async function authUser(req){
  const {url,pub}=env();if(!url||!pub)throw new Error("Supabase public non configuré.");
  const h=req.headers?.authorization||req.headers?.Authorization||"";const m=String(h).match(/^Bearer\s+(.+)$/i);if(!m)return null;
  const r=await fetch(`${url}/auth/v1/user`,{headers:{apikey:pub,Authorization:`Bearer ${m[1]}`}});if(!r.ok)return null;return r.json();
}
function adminHeaders(extra={}){const {secret}=env();const h={apikey:secret,"Content-Type":"application/json",...extra};if(secret&&!String(secret).startsWith("sb_secret_"))h.Authorization=`Bearer ${secret}`;return h}
async function adminRest(path,opts={}){const {url,secret}=env();if(!url||!secret)throw new Error("SUPABASE_SECRET_KEY manquante.");return fetch(`${url}/rest/v1/${path}`,{...opts,headers:adminHeaders(opts.headers||{})})}
async function getSubscription(userId){const r=await adminRest(`warboost_subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);if(!r.ok)throw new Error(`Lecture abonnement impossible (${r.status}).`);const rows=await r.json();return rows?.[0]||null}
function isPro(sub){return !!sub&&["active","trialing"].includes(String(sub.status||""))}
function today(){return new Date().toISOString().slice(0,10)}
async function rpc(name,body){const r=await adminRest(`rpc/${name}`,{method:"POST",body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.message||data?.hint||`RPC ${name} ${r.status}`);return data}
async function reserveCredit(userId){const limit=50;const rows=await rpc("consume_warboost_ai_credit",{p_user:userId,p_day:today(),p_limit:limit});const row=Array.isArray(rows)?rows[0]:rows;const used=Number(row?.used||0);return {allowed:!!row?.allowed,plan:"pro",used,limit,remaining:Math.max(0,limit-used)}}
async function refundCredit(userId){try{await rpc("refund_warboost_ai_credit",{p_user:userId,p_day:today()})}catch(e){console.error("scan quota refund",e)}}
function outputText(data){if(data?.output_text)return data.output_text;const out=[];for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==="output_text"&&c?.text)out.push(c.text);return out.join("\n")}
function parseJson(text){const t=String(text||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```$/i,"").trim();return JSON.parse(t)}

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{error:"Méthode non autorisée."});
  if(!process.env.OPENAI_API_KEY)return json(res,500,{error:"OPENAI_API_KEY manquante dans Vercel."});

  let user,usage;
  try{
    user=await authUser(req);
    if(!user)return json(res,401,{error:"Connecte ton compte WarBoost pour scanner des captures."});
    const sub=await getSubscription(user.id);
    if(!isPro(sub))return json(res,403,{error:"Le Smart Player Scan est réservé à WarBoost PRO."});
    usage=await reserveCredit(user.id);
    if(!usage.allowed)return json(res,429,{error:"Quota IA PRO du jour atteint.",usage});
  }catch(e){
    console.error("player scan entitlement",e);
    return json(res,503,{error:"Vérification du compte WarBoost indisponible."});
  }

  const images=Array.isArray(req.body?.images)?req.body.images:[];
  if(!images.length||images.length>4){
    await refundCredit(user.id);
    return json(res,400,{error:"Envoie entre 1 et 4 captures.",usage:{...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)}});
  }
  if(images.some(x=>typeof x!=="string"||!/^data:image\/(?:png|jpeg|jpg|webp);base64,/i.test(x))){
    await refundCredit(user.id);return json(res,400,{error:"Format d’image non accepté."});
  }
  const approx=images.reduce((n,x)=>n+x.length,0);
  if(approx>3900000){
    await refundCredit(user.id);return json(res,413,{error:"Captures trop lourdes après compression. Réessaie avec moins d’images."});
  }

  const langCode=String(req.body?.language||"fr").toLowerCase();
  const language=({fr:"français",en:"anglais",es:"espagnol",de:"allemand",ja:"japonais",zh:"chinois"})[langCode]||"français";
  const mode=String(req.body?.mode||"classic");

  if(mode==="shop_advisor"){
    const ctx=req.body?.shop_context&&typeof req.body.shop_context==="object"?req.body.shop_context:{};
    const budget=String(ctx.budget||"0");
    const focus=String(ctx.focus||"auto");
    const playerPriorities=Array.isArray(ctx.priorities)?ctx.priorities.slice(0,3):[];

    const shopSchema={
      type:"object",additionalProperties:false,
      properties:{
        shop:{
          type:"object",additionalProperties:false,
          properties:{
            summary:{type:"string"},
            detected_shops:{type:"array",maxItems:8,items:{type:"string"}},
            offers:{
              type:"array",maxItems:30,
              items:{
                type:"object",additionalProperties:false,
                properties:{
                  shop_type:{type:"string"},item_name:{type:"string"},
                  currency:{type:["string","null"]},price_text:{type:["string","null"]},
                  quantity_text:{type:["string","null"]},real_money:{type:"boolean"},
                  confidence:{type:"number",minimum:0,maximum:1}
                },
                required:["shop_type","item_name","currency","price_text","quantity_text","real_money","confidence"]
              }
            },
            recommendations:{
              type:"array",maxItems:14,
              items:{
                type:"object",additionalProperties:false,
                properties:{
                  rank:{type:"integer",minimum:1,maximum:20},
                  spend_type:{type:"string",enum:["in_game","paid"]},
                  shop_type:{type:"string"},item_name:{type:"string"},
                  price_text:{type:["string","null"]},
                  verdict:{type:"string",enum:["buy_now","good","situational","skip"]},
                  reason:{type:"string"},evidence:{type:"string"},player_fit:{type:"string"},
                  confidence:{type:"number",minimum:0,maximum:1}
                },
                required:["rank","spend_type","shop_type","item_name","price_text","verdict","reason","evidence","player_fit","confidence"]
              }
            },
            warnings:{type:"array",maxItems:8,items:{type:"string"}},
            next_capture:{type:["string","null"]}
          },
          required:["summary","detected_shops","offers","recommendations","warnings","next_capture"]
        }
      },
      required:["shop"]
    };

    const shopContent=[{
      type:"input_text",
      text:`Tu es le Smart Shop Advisor de WarBoost V20.3.4 pour Last War: Survival.

BUT
- Lire UNIQUEMENT les boutiques/offres visibles dans les captures.
- Reconnaître si possible : Boutique Diamants, VIP, Alliance, Honneur, Campagne, Saison, packs/offres payantes, ou autre.
- Classer ce qui vaut le coup pour CE joueur, en distinguant "sans argent réel" et "payant".
- Répondre en ${language}.

CONTEXTE JOUEUR
- Focus: ${focus}
- Budget argent réel: ${budget}
- Puissance formation visible: ${ctx.formation_power_m??"non renseignée"}
- Niveau Drone visible: ${ctx.drone_level??"non renseigné"}
- Priorités Smart Scan: ${JSON.stringify(playerPriorities).slice(0,3500)}

RÈGLES DE FIABILITÉ
- N'invente jamais un article, un prix, une quantité ou une remise non visible.
- Si le nom exact est illisible, décris l'article seulement si son icône/texte est suffisamment clair; sinon ne le recommande pas.
- Pour un pack payant, le prix doit être celui affiché. Ne convertis pas une devise.
- Un pourcentage de "valeur" ou "remise" affiché par le jeu n'est PAS une preuve suffisante de bon achat.
- Ne promet jamais un gain de puissance chiffré si ce gain n'est pas visible.
- Si plusieurs captures montrent la même offre, ne la duplique pas.

RÈGLES DE BASE WARBOOST (à utiliser comme orientation, pas comme excuse pour inventer)
- Boutique Honneur : les Plans d'équipement légendaires sont généralement une priorité très forte, surtout si l'équipement est le besoin du joueur.
- Boutique Alliance : fragments UR, accélérateurs construction/recherche, pièces de Drone sont des achats souvent utiles; conserver aussi assez de boucliers/téléporteurs pour les besoins opérationnels.
- Boutique VIP : endurance, fragments universels légendaires/UR et accélérateurs sont souvent intéressants; adapter au besoin réel du joueur et à son stock visible.
- Boutique Diamants : être prudent; éviter les achats de routine si un objet équivalent est disponible plus avantageusement ailleurs; téléporteurs/besoins urgents peuvent être situationnels.
- Boutique Campagne : coffres de ressources/campagne, pièces de Drone et fragments d'arme exclusive peuvent être utiles selon la progression.
- Boutique Saison : le contenu varie; classer seulement ce qui est réellement visible dans la capture.

RÈGLES PAYANTES
- Si budget="${budget}" vaut "0", classer toutes les offres payantes en "skip".
- Sinon, ne recommande un pack payant en "buy_now" que si son contenu visible correspond DIRECTEMENT à une priorité Smart Scan et offre une valeur claire par rapport aux autres offres visibles.
- Si une ressource équivalente est facilement accessible via une monnaie du jeu visible, signale-le et baisse la priorité du pack payant.
- Respecte le budget : petit budget = très sélectif; budget élevé ne signifie jamais "acheter tout".
- Si les packs visibles ne correspondent pas au besoin du joueur, la bonne recommandation peut être de ne rien acheter.

SORTIE
- "in_game" = achats avec monnaies du jeu (diamants, points VIP si applicable, alliance, honneur, campagne, saison, etc.), sans paiement réel au moment de l'achat.
- "paid" = argent réel / lingots / briques d'or / packs payants.
- evidence doit citer ce qui est VISIBLE dans la capture (nom, prix, quantité, icône clairement identifiée).
- Trie recommendations par utilité réelle pour le joueur.`
    }];
    for(const image_url of images)shopContent.push({type:"input_image",image_url,detail:"high"});

    const shopModel=process.env.OPENAI_VISION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
    const shopController=new AbortController();
    const shopTimeout=setTimeout(()=>shopController.abort(),52000);
    try{
      const rr=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
        signal:shopController.signal,
        body:JSON.stringify({
          model:shopModel,
          max_output_tokens:5000,
          input:[{role:"user",content:shopContent}],
          text:{verbosity:"low",format:{type:"json_schema",name:"warboost_shop_advisor",strict:true,schema:shopSchema}}
        })
      });
      const raw=await rr.text();let od={};
      try{od=raw?JSON.parse(raw):{}}catch{od={error:{message:raw.slice(0,500)}}}
      if(!rr.ok){
        await refundCredit(user.id);
        const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
        return json(res,rr.status===429?429:502,{error:od?.error?.message||"Erreur du Smart Shop Advisor.",usage:refunded});
      }
      if(od?.status==="incomplete"){
        await refundCredit(user.id);
        return json(res,502,{error:"L’analyse des boutiques a été interrompue. Réessaie avec moins de captures."});
      }
      let parsed;
      try{parsed=parseJson(outputText(od))}catch(e){
        await refundCredit(user.id);
        return json(res,502,{error:"Réponse boutique inexploitable. Réessaie avec une capture plus nette."});
      }
      if(!parsed?.shop)return json(res,502,{error:"Analyse boutique incomplète."});

      // garde-fou budget F2P
      if(budget==="0"&&Array.isArray(parsed.shop.recommendations)){
        parsed.shop.recommendations=parsed.shop.recommendations.map(x=>{
          if(x.spend_type==="paid")return {...x,verdict:"skip",reason:"Budget réglé sur 0 € : WarBoost ne recommande aucun achat payant."};
          return x;
        });
      }

      // classement stable sans doublons grossiers
      const seen=new Set();
      parsed.shop.recommendations=(parsed.shop.recommendations||[]).filter(x=>{
        const k=`${x.spend_type}|${x.shop_type}|${x.item_name}|${x.price_text||""}`.toLowerCase();
        if(seen.has(k))return false;seen.add(k);return true;
      }).sort((a,b)=>Number(a.rank||99)-Number(b.rank||99)).map((x,i)=>({...x,rank:i+1})).slice(0,14);

      return json(res,200,{shop:parsed.shop,model:shopModel,usage});
    }catch(e){
      await refundCredit(user.id);
      const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
      if(e?.name==="AbortError")return json(res,504,{error:"Le scan des boutiques a mis trop de temps. Réessaie avec 1 ou 2 captures.",usage:refunded});
      console.error("smart shop advisor",e);
      return json(res,500,{error:"Erreur serveur pendant l’analyse des boutiques.",usage:refunded});
    }finally{clearTimeout(shopTimeout)}
  }


  const content=[{
    type:"input_text",
    text:`Analyse ces captures de Last War: Survival comme le Smart Player Scan WarBoost V20.3.4.

OBJECTIF:
1. extraire uniquement les informations réellement visibles;
2. distinguer impérativement la puissance TOTALE DU COMPTE de la puissance DE FORMATION;
3. reconnaître correctement la STRUCTURE de l'écran "Détails de la formation";
4. lire le DRONE visible et son niveau lorsque le nombre est lisible;
5. analyser l'équilibre visible des 5 héros et de leurs équipements;
6. produire un ordre concret de ce que le joueur doit améliorer en premier.

STRUCTURE LAST WAR À RESPECTER:
- une formation comporte au maximum 5 HÉROS;
- le portrait de SUZERAIN / compagnon placé à gauche de la rangée des héros n'est JAMAIS un 6e héros;
- le DRONE n'est JAMAIS un héros;
- l'icône circulaire avec un drone/appareil et un nombre (ex. 157) correspond au niveau du drone lorsqu'elle est clairement visible;
- chaque héros dispose au maximum de 4 emplacements d'équipement;
- sur une formation complète : maximum 5 héros et maximum 20 équipements;
- les lignes d'équipements dans "Détails du héros" doivent être rattachées aux 5 héros, une ligne par héros;
- ne compte jamais les icônes de compétences, drone, suzerain, décoration ou autres boutons comme équipement.

RÈGLES ANTI-INVENTION:
- n'invente jamais une statistique cachée;
- n'invente jamais un niveau, une étoile, une arme exclusive ou un équipement non visible;
- si une valeur n'est pas lisible, mets null;
- un nombre affiché dans un écran "Détails de la formation" ou "Formation actuelle" est une puissance de FORMATION, pas la puissance totale du compte;
- power_m = puissance totale du compte UNIQUEMENT si l'écran l'indique clairement;
- formation_power_m = puissance de la formation visible;
- si le nom d'un héros n'est pas écrit mais que le portrait est reconnaissable avec forte confiance, tu peux le nommer; sinon utilise null et réfère-toi à sa position (Héros 1, Héros 2...);
- le niveau du drone doit aller dans player.drone.level, jamais dans un héros;
- ne compare pas directement le niveau du drone au niveau des héros : ce ne sont pas les mêmes systèmes de progression;
- base chaque recommandation sur une preuve visible dans la capture;
- ne donne pas de gain chiffré inventé. expected_impact est seulement high, medium ou low;
- si la capture ne permet pas une recommandation fiable, demande la prochaine capture utile au lieu d'inventer.

RÈGLES DE PRIORISATION V20.3.3:
1. Classe d'abord les FAIBLESSES RELATIVES visibles dans la formation.
2. Pour les équipements, compare les 20 pièces entre elles : niveau, étoiles/points visibles, qualité/tier/couleur si clairement lisible.
3. Si toutes les pièces sont au même niveau (par exemple Lv40), ne recommande PAS automatiquement "monter au-delà de Lv40". Cherche plutôt les pièces ayant moins d'étoiles/points, une qualité inférieure, ou un retard visible.
4. Pour un héros, une priorité est justifiée seulement si son niveau, ses étoiles, son arme exclusive ou ses équipements sont visiblement en retard par rapport aux autres héros.
5. Le Drone NE DOIT JAMAIS être priorité n°1 uniquement parce que son niveau est lisible ou parce qu'il "impacte toute la formation".
6. Un niveau de Drone isolé (ex. 157) ne prouve pas que le Drone est en retard. Sans écran détaillé du Drone/modules/composants, mets requires_more_info=true et place cette recommandation APRÈS les faiblesses visibles des héros/équipements.
7. Pour mettre le Drone en priorité n°1, il faut une preuve supplémentaire visible : module/composant/compétence clairement en retard, indicateur comparatif, ou autre donnée explicite montrant une faiblesse.
8. L'evidence d'une priorité doit citer précisément ce qui est visible (ex. "pièce du héros 3 avec moins d'étoiles que les autres"), pas une règle générale du jeu.
9. Si aucune faiblesse relative n'est lisible avec assez de confiance, ne fabrique pas de priorité forte : explique que la formation paraît homogène et demande une capture plus rapprochée.

LANGUE DE LA RÉPONSE: ${language}.
MODE: ${mode}.
Retourne uniquement la structure JSON demandée.`
  }];
  for(const image_url of images)content.push({type:"input_image",image_url,detail:"high"});

  const schema={
    type:"object",additionalProperties:false,
    properties:{
      player:{
        type:"object",additionalProperties:false,
        properties:{
          name:{type:["string","null"]},server:{type:["string","null"]},alliance:{type:["string","null"]},role:{type:["string","null"]},
          hq_level:{type:["number","null"]},power_m:{type:["number","null"]},formation_power_m:{type:["number","null"]},coordinates:{type:["string","null"]},
          drone:{type:"object",additionalProperties:false,properties:{level:{type:["number","null"]},power_m:{type:["number","null"]}},required:["level","power_m"]},
          technology_pct:{type:["number","null"]},gear_pct:{type:["number","null"]},main_squad_type:{type:["string","null"]},
          squads:{
            type:"array",maxItems:4,
            items:{
              type:"object",additionalProperties:false,
              properties:{
                name:{type:"string"},type:{type:["string","null"]},power_m:{type:["number","null"]},
                heroes:{
                  type:"array",maxItems:5,
                  items:{
                    type:"object",additionalProperties:false,
                    properties:{
                      name:{type:["string","null"]},position:{type:"integer",minimum:1,maximum:5},level:{type:["number","null"]},stars:{type:["number","null"]},
                      exclusive_weapon:{type:["number","null"]},gear_average:{type:["number","null"]},
                      equipment:{
                        type:"array",maxItems:4,
                        items:{
                          type:"object",additionalProperties:false,
                          properties:{slot:{type:["string","null"]},name:{type:["string","null"]},level:{type:["number","null"]},stars:{type:["number","null"]},tier:{type:["string","null"]}},
                          required:["slot","name","level","stars","tier"]
                        }
                      }
                    },
                    required:["name","position","level","stars","exclusive_weapon","gear_average","equipment"]
                  }
                }
              },
              required:["name","type","power_m","heroes"]
            }
          },
          confidence:{type:"number",minimum:0,maximum:1},
          notes:{type:"array",maxItems:10,items:{type:"string"}}
        },
        required:["name","server","alliance","role","hq_level","power_m","formation_power_m","coordinates","drone","technology_pct","gear_pct","main_squad_type","squads","confidence","notes"]
      },
      analysis:{
        type:"object",additionalProperties:false,
        properties:{
          formation_power_m:{type:["number","null"]},
          detected_heroes:{type:"integer",minimum:0,maximum:5},
          visible_equipment_count:{type:"integer",minimum:0,maximum:20},
          drone_detected:{type:"boolean"},
          drone_level:{type:["number","null"]},
          suzerain_detected:{type:"boolean"},
          structure_valid:{type:"boolean"},
          confidence:{type:"number",minimum:0,maximum:1},
          summary:{type:"string"},
          strengths:{type:"array",maxItems:4,items:{type:"string"}},
          priorities:{
            type:"array",maxItems:5,
            items:{
              type:"object",additionalProperties:false,
              properties:{
                rank:{type:"integer",minimum:1,maximum:5},severity:{type:"string",enum:["critical","high","medium","low"]},
                target:{type:"string"},action:{type:"string"},reason:{type:"string"},evidence:{type:"string"},
                expected_impact:{type:"string",enum:["high","medium","low"]},confidence:{type:"number",minimum:0,maximum:1},requires_more_info:{type:"boolean"}
              },
              required:["rank","severity","target","action","reason","evidence","expected_impact","confidence","requires_more_info"]
            }
          },
          missing_information:{type:"array",maxItems:8,items:{type:"string"}},
          next_capture:{type:["string","null"]}
        },
        required:["formation_power_m","detected_heroes","visible_equipment_count","drone_detected","drone_level","suzerain_detected","structure_valid","confidence","summary","strengths","priorities","missing_information","next_capture"]
      }
    },
    required:["player","analysis"]
  };

  const model=process.env.OPENAI_VISION_MODEL||process.env.OPENAI_MODEL||"gpt-5";
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),52000);

  try{
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
      signal:controller.signal,
      body:JSON.stringify({
        model,
        max_output_tokens:4500,
        input:[{role:"user",content}],
        text:{verbosity:"low",format:{type:"json_schema",name:"warboost_smart_player_scan",strict:true,schema}}
      })
    });

    const raw=await r.text();let data={};
    try{data=raw?JSON.parse(raw):{}}catch{data={error:{message:raw.slice(0,500)}}}

    if(!r.ok){
      await refundCredit(user.id);
      const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
      return json(res,r.status===429?429:502,{error:data?.error?.message||"Erreur du moteur Smart Scan.",usage:refunded});
    }
    if(data?.status==="incomplete"){
      await refundCredit(user.id);
      return json(res,502,{error:"Le Smart Scan a été interrompu avant la fin. Réessaie avec une seule capture nette."});
    }

    const text=outputText(data);let parsed;
    try{parsed=parseJson(text)}catch(e){
      console.error("smart scan invalid json",text?.slice(0,1200));
      await refundCredit(user.id);
      return json(res,502,{error:"Le Smart Scan a répondu dans un format inexploitable. Réessaie avec une capture plus nette."});
    }
    if(!parsed?.player||!parsed?.analysis){
      await refundCredit(user.id);
      return json(res,502,{error:"Analyse incomplète. Réessaie avec une capture des détails de formation."});
    }

    // V20.3.2 — garde-fous déterministes pour l'écran Last War "Détails de la formation".
    // Le Suzerain et le Drone ne doivent jamais devenir des héros.
    if(!Array.isArray(parsed.player.squads))parsed.player.squads=[];
    if(mode==="smart_formation"&&parsed.player.squads.length>1){
      parsed.player.squads=parsed.player.squads.slice(0,1);
    }
    for(const squad of parsed.player.squads){
      let heroes=Array.isArray(squad.heroes)?squad.heroes:[];
      const byPosition=new Map();
      const noPosition=[];
      for(const h of heroes){
        if(!h||typeof h!=="object")continue;
        const pos=Number(h.position||0);
        if(pos>=1&&pos<=5&&!byPosition.has(pos))byPosition.set(pos,h);
        else noPosition.push(h);
      }
      heroes=[...byPosition.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
      for(const h of noPosition){
        if(heroes.length>=5)break;
        if(!heroes.includes(h))heroes.push(h);
      }
      heroes=heroes.slice(0,5);
      heroes.forEach((h,i)=>{
        h.position=i+1;
        h.equipment=(Array.isArray(h.equipment)?h.equipment:[]).slice(0,4);
      });
      squad.heroes=heroes;
    }

    const primary=parsed.player.squads[0]||null;
    const actualHeroes=(primary?.heroes||[]).filter(h=>h&&(h.name||h.level!=null||h.stars!=null||(h.equipment||[]).length)).length;
    const actualGear=(primary?.heroes||[]).reduce((n,h)=>n+(h?.equipment||[]).slice(0,4).length,0);
    parsed.analysis.detected_heroes=Math.min(5,actualHeroes);
    parsed.analysis.visible_equipment_count=Math.min(20,actualGear);

    const droneLevel=Number(parsed.player?.drone?.level||parsed.analysis?.drone_level||0)||null;
    if(droneLevel!=null){
      parsed.player.drone.level=droneLevel;
      parsed.analysis.drone_level=droneLevel;
      parsed.analysis.drone_detected=true;
    }else{
      parsed.analysis.drone_level=null;
      parsed.analysis.drone_detected=!!(parsed.player?.drone?.power_m);
    }

    parsed.analysis.structure_valid=
      parsed.analysis.detected_heroes<=5 &&
      parsed.analysis.visible_equipment_count<=20 &&
      (primary?.heroes||[]).every(h=>(h?.equipment||[]).length<=4);

    // Si l'écran est une formation complète et que 5 héros sont présents,
    // l'absence de 20 équipements signifie simplement qu'une partie n'était pas lisible.
    if(parsed.analysis.detected_heroes===5&&parsed.analysis.visible_equipment_count<20){
      if(!Array.isArray(parsed.analysis.missing_information))parsed.analysis.missing_information=[];
      const msg="Certains emplacements d’équipement ne sont pas assez lisibles pour être comptés avec certitude.";
      if(!parsed.analysis.missing_information.includes(msg))parsed.analysis.missing_information.push(msg);
    }


    // V20.3.3 — Priorités fiables : un simple niveau de Drone n'est pas une preuve de retard.
    if(Array.isArray(parsed.analysis.priorities)){
      const isDrone=p=>/\bdrone\b/i.test(`${p?.target||""} ${p?.action||""} ${p?.reason||""}`);
      const droneSupported=p=>{
        const e=String(p?.evidence||"").toLowerCase();
        // Un nombre/une icône de niveau seul ne suffit pas.
        const onlyLevel=/\b(level|niveau|niv\.?|lvl\.?)\b/.test(e) && !/(module|composant|component|skill|compétence|retard|inférieur|lower|behind|étoile|star|qualité|tier)/i.test(e);
        const strong=/(module|composant|component|skill|compétence|retard|inférieur|lower|behind|étoile|star|qualité|tier)/i.test(e);
        return strong && !onlyLevel;
      };

      const normal=[];
      const weakDrone=[];
      for(const p of parsed.analysis.priorities){
        if(isDrone(p)&&!droneSupported(p)){
          p.requires_more_info=true;
          p.confidence=Math.min(Number(p.confidence||0.5),0.55);
          p.expected_impact=p.expected_impact==="high"?"medium":(p.expected_impact||"medium");
          p.severity=p.severity==="critical"||p.severity==="high"?"medium":(p.severity||"medium");
          if(!String(p.reason||"").toLowerCase().includes("détail")){
            p.reason="Le niveau du Drone est visible, mais cela ne suffit pas à prouver qu’il est le maillon faible de cette formation.";
          }
          if(!String(p.action||"").toLowerCase().includes("détail")){
            p.action="Ouvrir les détails du Drone et de ses modules avant d’en faire une priorité majeure.";
          }
          weakDrone.push(p);
        }else{
          normal.push(p);
        }
      }

      // Les priorités appuyées par une faiblesse visible passent avant le Drone non prouvé.
      parsed.analysis.priorities=[...normal,...weakDrone].slice(0,5).map((p,i)=>({...p,rank:i+1}));

      if(weakDrone.length){
        if(!Array.isArray(parsed.analysis.missing_information))parsed.analysis.missing_information=[];
        const msg="Capture détaillée du Drone/modules nécessaire pour savoir s’il mérite réellement une priorité élevée.";
        if(!parsed.analysis.missing_information.includes(msg))parsed.analysis.missing_information.push(msg);
        if(!parsed.analysis.next_capture){
          parsed.analysis.next_capture="Ouvre les détails du Drone et prends une capture de son niveau, de ses modules/composants et améliorations visibles.";
        }
      }
    }

    if(parsed.player.formation_power_m==null && parsed.analysis.formation_power_m!=null)parsed.player.formation_power_m=parsed.analysis.formation_power_m;
    if(parsed.player.formation_power_m!=null){
      if(!Array.isArray(parsed.player.squads))parsed.player.squads=[];
      if(!parsed.player.squads.length)parsed.player.squads.push({name:"Formation actuelle",type:parsed.player.main_squad_type||null,power_m:parsed.player.formation_power_m,heroes:[]});
      else if(parsed.player.squads[0].power_m==null)parsed.player.squads[0].power_m=parsed.player.formation_power_m;
    }

    return json(res,200,{player:parsed.player,analysis:parsed.analysis,model,usage});
  }catch(e){
    await refundCredit(user.id);
    const refunded={...usage,used:Math.max(0,usage.used-1),remaining:Math.min(usage.limit,usage.remaining+1)};
    if(e?.name==="AbortError")return json(res,504,{error:"Le Smart Scan a mis trop de temps. Réessaie avec une seule capture.",usage:refunded});
    console.error("smart player scan",e);
    return json(res,500,{error:"Erreur serveur pendant le Smart Scan.",usage:refunded});
  }finally{clearTimeout(timeout)}
}
