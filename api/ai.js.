const ACTIONS = {
  player_coach: `Tu es WarBoost AI, coach stratégique pour un jeu mobile de guerre/gestion. Analyse uniquement les données fournies. Ne prétends pas connaître une mécanique ou un héros absent des données. Donne : score qualitatif, TOP 3 priorités, ce qu'il faut arrêter de disperser, plan 7 jours, et prochaine ressource à économiser.`,
  r5_dashboard: `Tu aides un R5/R4 à piloter une alliance. À partir du contexte et du roster, donne : 5 priorités du jour, 3 alertes, responsables R5/R4 suggérés et actions immédiates. N'invente aucune donnée.`,
  war_plan: `Crée un plan de guerre d'alliance clair : objectif, phases avant/pendant/après, rôles R5/R4, groupes suggérés à partir du roster, message de départ et plan B. Si des infos manquent, signale les hypothèses.`,
  r4_management: `Aide le R5 à répartir les responsabilités R4. Propose 4 à 6 fonctions, tâches concrètes, routine quotidienne/hebdo et méthode de remplacement en cas d'absence. Utilise les données disponibles sans inventer de compétence personnelle.`,
  alliance_message: `Rédige un message d'alliance très clair, court et prêt à copier-coller à partir de la situation. Donne une version principale puis une version ultra-courte.`,
  weekly_report: `Produis un rapport hebdomadaire R5/R4 : résumé, points forts, risques, membres/groupes à surveiller selon les données, décisions à prendre et objectifs semaine suivante.`,
  r5_question: `Réponds comme copilote opérationnel R5/R4. Donne une réponse structurée, praticable sur téléphone et centrée sur la question. Si une règle spécifique du jeu n'est pas fournie, ne l'invente pas.`,
  vs_plan: `Crée un plan VS pratique à partir du jour, des réserves/contextes et du roster. Donne priorités, ressources à conserver, consigne R5, consigne R4, message membres et erreur principale à éviter. N'invente pas de barème.`,
  season_plan: `Crée un conseil de saison à partir de la saison, profession, contexte et roster. Donne : 3 priorités, rôle R5/R4, ressources à conserver et pièges à éviter. N'invente pas de mécanique saisonnière non fournie.`
};

const languageName = {fr:"français",en:"anglais",es:"espagnol",de:"allemand",ja:"japonais",zh:"chinois"};

function outputText(data){
  if (data?.output_text) return data.output_text;
  const chunks=[];
  for(const item of data?.output||[]){
    for(const c of item?.content||[]){
      if(c?.type==="output_text" && c?.text) chunks.push(c.text);
    }
  }
  return chunks.join("\n");
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Méthode non autorisée."});
  if(!process.env.OPENAI_API_KEY) return res.status(500).json({error:"OPENAI_API_KEY manquante dans Vercel."});

  try{
    const {action,context,language="fr"}=req.body||{};
    if(!ACTIONS[action]) return res.status(400).json({error:"Action IA inconnue."});

    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL || "gpt-5.6-terra",
        reasoning:{effort:"low"},
        instructions:`${ACTIONS[action]}\nRéponds en ${languageName[language]||"français"}. Utilise des titres courts et des puces. Sois concret et concis.`,
        input:`Données WarBoost :\n${JSON.stringify(context||{},null,2).slice(0,30000)}`
      })
    });

    const data=await response.json();
    if(!response.ok){
      console.error("OpenAI error",data);
      return res.status(response.status).json({error:data?.error?.message||"Erreur OpenAI."});
    }
    const text=outputText(data)||"Aucun texte généré.";
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({text});
  }catch(err){
    console.error(err);
    return res.status(500).json({error:"Erreur serveur WarBoost AI."});
  }
}
