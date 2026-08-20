function num(v){if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null}
function metric(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const m=String(v).replace(",",".").match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):null;
}
function gearMetric(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const matches=String(v).replaceAll(",",".").match(/-?\d+(?:\.\d+)?/g)||[];
  const vals=matches.map(Number).filter(Number.isFinite);return vals.length?Math.min(...vals):null;
}
function fmt(v,locale){const n=Number(v);return Number.isFinite(n)?`${n.toLocaleString(locale,{maximumFractionDigits:2})} M`:"—"}
function cleanName(v){return String(v||"").trim()}
function heroConfigured(h){
  const name=cleanName(h?.name);
  return Boolean((name&&!/^(hero|héros)\s*\d+$/i.test(name))||num(h?.level)!==null||num(h?.stars)!==null||num(h?.power)!==null||cleanName(h?.exclusive)||cleanName(h?.gear));
}
function squadConfigured(s){return Boolean(num(s?.power)!==null||s?.updated_at||(s?.heroes||[]).some(heroConfigured))}
function localePack(locale){
  const x=String(locale||"en").toLowerCase();
  if(x.startsWith("fr"))return "fr";if(x.startsWith("es"))return "es";if(x.startsWith("de"))return "de";if(x.startsWith("ja"))return "ja";if(x.startsWith("zh"))return "zh";if(x.startsWith("ar"))return "ar";return "en";
}
const T={
  fr:{
    main:(n,p)=>`Concentre tes ressources sur ${n} (${p}).`,
    mainDetail:(n,p,g)=>`Concentre tes ressources sur ${n} (${p}). ${g}`,
    noSquad:"Scanne au moins une escouade pour activer le diagnostic PRO.",
    needHeroes:n=>`Rescanne ${n} sur un écran où les 5 héros sont visibles : WarBoost a besoin de leurs niveaux, étoiles, armes exclusives et équipements pour classer les achats avec précision.`,
    level:(h,g,t)=>`${h} a ${g} niveaux de retard sur le héros le plus avancé de l'escouade (cible observée : Nv.${t}).`,
    stars:(h,g)=>`${h} a ${g} étoile${g>1?"s":""} à rattraper pour atteindre 5★.`,
    exclusive:(h,g,t)=>`${h} a une arme exclusive en retrait de ${g} niveau${g>1?"x":""} par rapport au meilleur niveau observé (${t}).`,
    gear:(h,g,t)=>`${h} a un équipement en retrait de ${g} niveau${g>1?"x":""} par rapport au meilleur niveau visible (${t}).`,
    drone:(l,p)=>`Drone : ${l?`Nv.${l}`:"niveau non lu"}${p?` · ${p}`:""}. Continue les composants uniquement après les écarts prioritaires de l'escouade principale.`,
    scanMissing:list=>`Il manque encore ${list}. Scanne-les pour que WarBoost compare réellement les 4 escouades.`,
    actionLevel:h=>`Monte d'abord le niveau de ${h}, puis re-scanne l'escouade pour mesurer le gain.`,
    actionStars:h=>`Priorise les fragments de ${h} / fragments universels UR jusqu'au prochain palier d'étoiles.`,
    actionExclusive:h=>`Mets les fragments d'arme exclusive sur ${h} avant de les disperser sur une autre escouade.`,
    actionGear:h=>`Renforce d'abord l'équipement le plus faible de ${h}, puis équilibre les 5 héros.`,
    actionDrone:"Garde une réserve de composants et données de Drone ; investis-les après les 1–2 plus gros écarts héros.",
    actionScan:"Aucun achat maintenant : complète d'abord le scan pour éviter une mauvaise dépense.",
    freeHero:"Boutiques Alliance / Honneur / événements : fragments universels UR ou fragments du héros, si disponibles.",
    paidHero:"Si tu dépenses : choisis seulement un pack contenant les fragments correspondant à cette priorité.",
    freeLevel:"Récompenses, événements et boutiques gratuites : EXP Héros / ressources de montée de niveau.",
    paidLevel:"Évite un pack générique : prends uniquement de l'EXP Héros si ce retard bloque réellement ton escouade 1.",
    freeExclusive:"Événements et boutiques : fragments d'arme exclusive, si disponibles.",
    paidExclusive:"Pack arme exclusive uniquement pour le héros prioritaire ; ne répartis pas sur plusieurs héros.",
    freeGear:"Boutiques Honneur / événements : minerai d'amélioration et plans d'équipement, selon disponibilité.",
    paidGear:"Pack équipement/plans seulement si l'équipement est le principal goulot détecté.",
    freeDrone:"Événements et boutiques : composants de Drone / données de combat, selon disponibilité.",
    paidDrone:"Pack Drone uniquement après les priorités héros/équipement classées au-dessus.",
    freeNone:"Ne dépense rien avant d'avoir un scan complet.",paidNone:"Aucun achat payant recommandé avec des données incomplètes.",
    focusHold:(n)=>`Ne disperse pas tes ressources sur ${n} tant que les écarts prioritaires de l'escouade principale ne sont pas corrigés.`,
    squadStatusMain:"Priorité principale",squadStatusReady:"Secondaire",squadStatusLow:"À conserver",squadStatusMissing:"À scanner",
    confidence:n=>`Confiance ${n}%`,
    titles:{scan:"Compléter les données",level:"Niveau héros",stars:"Étoiles héros",exclusive:"Arme exclusive",gear:"Équipement",drone:"Drone",focus:"Concentration des ressources"}
  },
  en:{
    main:(n,p)=>`Focus your resources on ${n} (${p}).`,mainDetail:(n,p,g)=>`Focus your resources on ${n} (${p}). ${g}`,noSquad:"Scan at least one squad to activate the PRO diagnostic.",
    needHeroes:n=>`Rescan ${n} on a screen where all 5 heroes are visible. WarBoost needs levels, stars, exclusive weapons and gear to rank purchases accurately.`,
    level:(h,g,t)=>`${h} is ${g} level${g>1?"s":""} behind the most advanced hero in the squad (observed target: Lv.${t}).`,stars:(h,g)=>`${h} is ${g} star${g>1?"s":""} short of 5★.`,exclusive:(h,g,t)=>`${h}'s exclusive weapon is ${g} level${g>1?"s":""} behind the best visible level (${t}).`,gear:(h,g,t)=>`${h}'s gear is ${g} level${g>1?"s":""} behind the best visible level (${t}).`,drone:(l,p)=>`Drone: ${l?`Lv.${l}`:"level not read"}${p?` · ${p}`:""}. Keep Drone materials after the main-squad gaps above.`,scanMissing:list=>`${list} still need scanning so WarBoost can compare all 4 squads.`,
    actionLevel:h=>`Raise ${h}'s level first, then rescan to measure the gain.`,actionStars:h=>`Prioritize ${h} shards / universal UR shards until the next star step.`,actionExclusive:h=>`Put exclusive-weapon shards into ${h} before spreading them to another squad.`,actionGear:h=>`Upgrade ${h}'s weakest gear first, then rebalance the 5 heroes.`,actionDrone:"Keep Drone components and battle data in reserve; spend them after the top 1–2 hero gaps.",actionScan:"Do not buy yet: complete the scan first to avoid a bad purchase.",
    freeHero:"Alliance / Honor / event shops: universal UR shards or target-hero shards when available.",paidHero:"If you spend: choose only a pack containing shards for this priority.",freeLevel:"Rewards, events and free shops: Hero EXP / level-up resources.",paidLevel:"Avoid generic packs; buy Hero EXP only if this level gap is truly blocking Squad 1.",freeExclusive:"Events and shops: exclusive-weapon shards when available.",paidExclusive:"Exclusive-weapon pack only for the priority hero; do not split across several heroes.",freeGear:"Honor / event shops: upgrade ore and gear blueprints when available.",paidGear:"Gear/blueprint pack only if gear is the main detected bottleneck.",freeDrone:"Events and shops: Drone components / battle data when available.",paidDrone:"Drone pack only after the hero/gear priorities ranked above.",freeNone:"Spend nothing until the scan is complete.",paidNone:"No paid purchase recommended with incomplete data.",focusHold:n=>`Do not spread resources to ${n} until the main-squad priority gaps are fixed.`,
    squadStatusMain:"Main priority",squadStatusReady:"Secondary",squadStatusLow:"Hold",squadStatusMissing:"Scan needed",confidence:n=>`Confidence ${n}%`,titles:{scan:"Complete the data",level:"Hero level",stars:"Hero stars",exclusive:"Exclusive weapon",gear:"Gear",drone:"Drone",focus:"Resource focus"}
  },
  es:{
    main:(n,p)=>`Concentra tus recursos en ${n} (${p}).`,mainDetail:(n,p,g)=>`Concentra tus recursos en ${n} (${p}). ${g}`,noSquad:"Escanea al menos un escuadrón para activar el diagnóstico PRO.",needHeroes:n=>`Vuelve a escanear ${n} mostrando los 5 héroes. WarBoost necesita niveles, estrellas, armas exclusivas y equipo para ordenar bien las compras.`,level:(h,g,t)=>`${h} está ${g} nivel(es) por detrás del héroe más avanzado (objetivo observado: Nv.${t}).`,stars:(h,g)=>`${h} necesita ${g} estrella(s) para llegar a 5★.`,exclusive:(h,g,t)=>`El arma exclusiva de ${h} está ${g} nivel(es) por debajo del mejor nivel visible (${t}).`,gear:(h,g,t)=>`El equipo de ${h} está ${g} nivel(es) por debajo del mejor nivel visible (${t}).`,drone:(l,p)=>`Dron: ${l?`Nv.${l}`:"nivel no leído"}${p?` · ${p}`:""}. Invierte después de los principales huecos del escuadrón 1.`,scanMissing:l=>`Falta escanear ${l} para comparar los 4 escuadrones.`,actionLevel:h=>`Sube primero el nivel de ${h} y vuelve a escanear.`,actionStars:h=>`Prioriza fragmentos de ${h} / fragmentos UR universales.`,actionExclusive:h=>`Pon los fragmentos de arma exclusiva en ${h} antes de repartirlos.`,actionGear:h=>`Mejora primero el equipo más débil de ${h}.`,actionDrone:"Reserva componentes y datos del Dron hasta cerrar los 1–2 mayores huecos de héroes.",actionScan:"No compres todavía: completa el escaneo primero.",freeHero:"Tiendas de Alianza / Honor / eventos: fragmentos UR universales o del héroe, si están disponibles.",paidHero:"Si gastas: solo un pack con los fragmentos de esta prioridad.",freeLevel:"Recompensas, eventos y tiendas gratuitas: EXP de héroe.",paidLevel:"Evita packs genéricos; compra EXP solo si este nivel bloquea el escuadrón 1.",freeExclusive:"Eventos y tiendas: fragmentos de arma exclusiva.",paidExclusive:"Pack de arma exclusiva solo para el héroe prioritario.",freeGear:"Honor / eventos: mineral de mejora y planos de equipo.",paidGear:"Pack de equipo/planos solo si el equipo es el cuello de botella.",freeDrone:"Eventos y tiendas: componentes de Dron / datos de combate.",paidDrone:"Pack de Dron solo después de las prioridades anteriores.",freeNone:"No gastes hasta completar el escaneo.",paidNone:"No se recomienda compra de pago con datos incompletos.",focusHold:n=>`No repartas recursos en ${n} hasta corregir las prioridades del escuadrón principal.`,squadStatusMain:"Prioridad principal",squadStatusReady:"Secundario",squadStatusLow:"Conservar",squadStatusMissing:"Escanear",confidence:n=>`Confianza ${n}%`,titles:{scan:"Completar datos",level:"Nivel de héroe",stars:"Estrellas",exclusive:"Arma exclusiva",gear:"Equipo",drone:"Dron",focus:"Concentración"}
  },
  de:{
    main:(n,p)=>`Konzentriere deine Ressourcen auf ${n} (${p}).`,mainDetail:(n,p,g)=>`Konzentriere deine Ressourcen auf ${n} (${p}). ${g}`,noSquad:"Scanne mindestens einen Trupp für die PRO-Diagnose.",needHeroes:n=>`Scanne ${n} erneut, wobei alle 5 Helden sichtbar sind. WarBoost braucht Level, Sterne, Exklusivwaffen und Ausrüstung für eine genaue Kaufreihenfolge.`,level:(h,g,t)=>`${h} liegt ${g} Level hinter dem am weitesten entwickelten Helden (beobachtetes Ziel: Lv.${t}).`,stars:(h,g)=>`${h} fehlen ${g} Stern(e) bis 5★.`,exclusive:(h,g,t)=>`${h}s Exklusivwaffe liegt ${g} Level unter dem besten sichtbaren Wert (${t}).`,gear:(h,g,t)=>`${h}s Ausrüstung liegt ${g} Level unter dem besten sichtbaren Wert (${t}).`,drone:(l,p)=>`Drohne: ${l?`Lv.${l}`:"Level nicht erkannt"}${p?` · ${p}`:""}. Erst nach den Hauptlücken des Haupttrupps investieren.`,scanMissing:l=>`${l} müssen noch gescannt werden, damit alle 4 Trupps verglichen werden.`,actionLevel:h=>`Erhöhe zuerst ${h}s Level und scanne danach erneut.`,actionStars:h=>`Priorisiere Fragmente für ${h} / universelle UR-Fragmente.`,actionExclusive:h=>`Exklusivwaffen-Fragmente zuerst in ${h} investieren.`,actionGear:h=>`Verbessere zuerst ${h}s schwächste Ausrüstung.`,actionDrone:"Drohnen-Komponenten und Kampfdaten zurückhalten, bis die größten Heldenlücken geschlossen sind.",actionScan:"Noch nichts kaufen: zuerst den Scan vervollständigen.",freeHero:"Allianz-/Ehre-/Event-Shop: universelle UR- oder Heldenfragmente, falls verfügbar.",paidHero:"Wenn du ausgibst: nur ein Paket mit Fragmenten für diese Priorität.",freeLevel:"Belohnungen, Events und Gratis-Shops: Helden-EXP.",paidLevel:"Keine generischen Pakete; EXP nur kaufen, wenn dieses Levelproblem Trupp 1 blockiert.",freeExclusive:"Events/Shops: Exklusivwaffen-Fragmente.",paidExclusive:"Exklusivwaffen-Paket nur für den Prioritätshelden.",freeGear:"Ehre/Events: Upgrade-Erz und Ausrüstungspläne.",paidGear:"Ausrüstungs-/Blueprint-Paket nur bei erkanntem Ausrüstungsengpass.",freeDrone:"Events/Shops: Drohnen-Komponenten / Kampfdaten.",paidDrone:"Drohnen-Paket erst nach den höher eingestuften Prioritäten.",freeNone:"Bis zum vollständigen Scan nichts ausgeben.",paidNone:"Bei unvollständigen Daten kein Kauf empfohlen.",focusHold:n=>`Ressourcen nicht auf ${n} verteilen, bevor die Hauptlücken des Haupttrupps behoben sind.`,squadStatusMain:"Hauptpriorität",squadStatusReady:"Sekundär",squadStatusLow:"Halten",squadStatusMissing:"Scannen",confidence:n=>`Vertrauen ${n}%`,titles:{scan:"Daten vervollständigen",level:"Heldenlevel",stars:"Sterne",exclusive:"Exklusivwaffe",gear:"Ausrüstung",drone:"Drohne",focus:"Ressourcenfokus"}
  },
  ja:{
    main:(n,p)=>`${n}（${p}）に資源を集中。`,mainDetail:(n,p,g)=>`${n}（${p}）に資源を集中。${g}`,noSquad:"PRO診断を有効にするには少なくとも1部隊をスキャンしてください。",needHeroes:n=>`${n}を5人の英雄が見える画面で再スキャンしてください。レベル、星、専用武器、装備が揃うと購入優先度を正確に判定できます。`,level:(h,g,t)=>`${h}は部隊内の最高レベルより${g}レベル低いです（確認できた目標：Lv.${t}）。`,stars:(h,g)=>`${h}は5★まであと${g}段階です。`,exclusive:(h,g,t)=>`${h}の専用武器は確認できた最高値${t}より${g}レベル低いです。`,gear:(h,g,t)=>`${h}の装備は確認できた最高値${t}より${g}レベル低いです。`,drone:(l,p)=>`ドローン：${l?`Lv.${l}`:"レベル未読"}${p?` · ${p}`:""}。主力部隊の上位ギャップを直した後に投資。`,scanMissing:l=>`${l}が未スキャンです。4部隊比較のため追加してください。`,actionLevel:h=>`${h}のレベルを先に上げ、再スキャンして効果を確認。`,actionStars:h=>`${h}の欠片／UR万能欠片を次の星段階まで優先。`,actionExclusive:h=>`専用武器欠片は他部隊に分散せず${h}を優先。`,actionGear:h=>`${h}の最も弱い装備から強化。`,actionDrone:"ドローン部品と戦闘データは、英雄の上位1～2ギャップを埋めるまで温存。",actionScan:"今は購入しないで、先にスキャンを完成させてください。",freeHero:"同盟／名誉／イベントショップ：UR万能欠片または対象英雄の欠片。",paidHero:"課金する場合、この優先対象の欠片が入るパックだけを選択。",freeLevel:"報酬・イベント・無料ショップ：英雄EXP。",paidLevel:"汎用パックは避け、このレベル差が主力部隊を止める場合のみEXPを購入。",freeExclusive:"イベント／ショップ：専用武器欠片。",paidExclusive:"専用武器パックは優先英雄のみ。",freeGear:"名誉／イベント：強化鉱石と装備設計図。",paidGear:"装備が主ボトルネックの場合のみ装備／設計図パック。",freeDrone:"イベント／ショップ：ドローン部品／戦闘データ。",paidDrone:"上位の英雄・装備優先度の後だけドローンパック。",freeNone:"スキャン完了まで資源を使わない。",paidNone:"データ不足時は有料購入を推奨しません。",focusHold:n=>`主力部隊の優先ギャップが解消するまで${n}へ資源を分散しない。`,squadStatusMain:"主力優先",squadStatusReady:"第2優先",squadStatusLow:"温存",squadStatusMissing:"要スキャン",confidence:n=>`信頼度 ${n}%`,titles:{scan:"データ完成",level:"英雄レベル",stars:"英雄の星",exclusive:"専用武器",gear:"装備",drone:"ドローン",focus:"資源集中"}
  },
  zh:{
    main:(n,p)=>`优先把资源集中到 ${n}（${p}）。`,mainDetail:(n,p,g)=>`优先把资源集中到 ${n}（${p}）。${g}`,noSquad:"至少扫描一支队伍以启用 PRO 诊断。",needHeroes:n=>`请在5名英雄都可见的画面重新扫描 ${n}。WarBoost 需要等级、星级、专武和装备来准确排序购买。`,level:(h,g,t)=>`${h} 比队内最高英雄低 ${g} 级（已观察目标：Lv.${t}）。`,stars:(h,g)=>`${h} 距离5★还差 ${g} 星。`,exclusive:(h,g,t)=>`${h} 的专武比可见最高等级 ${t} 低 ${g} 级。`,gear:(h,g,t)=>`${h} 的装备比可见最高等级 ${t} 低 ${g} 级。`,drone:(l,p)=>`无人机：${l?`Lv.${l}`:"等级未读取"}${p?` · ${p}`:""}。先处理主队上方优先缺口，再投入无人机。`,scanMissing:l=>`${l} 尚未扫描，补齐后才能比较4支队伍。`,actionLevel:h=>`先提升 ${h} 的等级，然后重新扫描确认提升。`,actionStars:h=>`优先 ${h} 碎片／UR万能碎片直到下一星级。`,actionExclusive:h=>`专武碎片优先投入 ${h}，不要分散到其他队伍。`,actionGear:h=>`先强化 ${h} 最弱的装备。`,actionDrone:"保留无人机组件和战斗数据，先解决英雄前1–2个主要缺口。",actionScan:"暂时不要购买：先补全扫描，避免错误消费。",freeHero:"联盟／荣誉／活动商店：UR万能碎片或目标英雄碎片（如有）。",paidHero:"如付费，只选包含当前优先碎片的礼包。",freeLevel:"奖励、活动和免费商店：英雄EXP。",paidLevel:"避免通用礼包；仅当等级差真正卡住1队时购买EXP。",freeExclusive:"活动／商店：专武碎片。",paidExclusive:"专武礼包只给优先英雄，不要分散。",freeGear:"荣誉／活动：强化矿石和装备蓝图。",paidGear:"仅当装备是主要瓶颈时购买装备／蓝图礼包。",freeDrone:"活动／商店：无人机组件／战斗数据。",paidDrone:"在更高优先级的英雄/装备之后再考虑无人机礼包。",freeNone:"扫描完成前不要花资源。",paidNone:"数据不完整时不建议付费购买。",focusHold:n=>`主队优先缺口解决前，不要把资源分散到 ${n}。`,squadStatusMain:"主优先",squadStatusReady:"次优先",squadStatusLow:"保留",squadStatusMissing:"需扫描",confidence:n=>`置信度 ${n}%`,titles:{scan:"补全数据",level:"英雄等级",stars:"英雄星级",exclusive:"专武",gear:"装备",drone:"无人机",focus:"资源集中"}
  },
  ar:{
    main:(n,p)=>`ركّز مواردك على ${n} (${p}).`,mainDetail:(n,p,g)=>`ركّز مواردك على ${n} (${p}). ${g}`,noSquad:"امسح فريقاً واحداً على الأقل لتفعيل تشخيص PRO.",needHeroes:n=>`أعد مسح ${n} على شاشة تظهر الأبطال الخمسة. يحتاج WarBoost إلى المستويات والنجوم والسلاح الحصري والمعدات لترتيب المشتريات بدقة.`,level:(h,g,t)=>`${h} أقل بـ ${g} مستوى من أعلى بطل في الفريق (الهدف المرصود: Lv.${t}).`,stars:(h,g)=>`${h} يحتاج ${g} نجمة للوصول إلى 5★.`,exclusive:(h,g,t)=>`السلاح الحصري لـ ${h} أقل بـ ${g} مستوى من أفضل مستوى ظاهر (${t}).`,gear:(h,g,t)=>`معدات ${h} أقل بـ ${g} مستوى من أفضل مستوى ظاهر (${t}).`,drone:(l,p)=>`الدرون: ${l?`Lv.${l}`:"المستوى غير مقروء"}${p?` · ${p}`:""}. استثمر بعد فجوات الفريق الرئيسي الأعلى.`,scanMissing:l=>`ما زال ${l} بحاجة للمسح لمقارنة الفرق الأربعة.`,actionLevel:h=>`ارفع مستوى ${h} أولاً ثم أعد المسح لقياس المكسب.`,actionStars:h=>`أعطِ الأولوية لشظايا ${h} / شظايا UR العامة.`,actionExclusive:h=>`ضع شظايا السلاح الحصري في ${h} قبل توزيعها على فريق آخر.`,actionGear:h=>`طوّر أضعف معدات ${h} أولاً.`,actionDrone:"احتفظ بمكونات الدرون وبيانات القتال حتى تعالج أكبر فجوتين للأبطال.",actionScan:"لا تشترِ الآن: أكمل المسح أولاً لتجنب إنفاق خاطئ.",freeHero:"متاجر التحالف / الشرف / الأحداث: شظايا UR عامة أو شظايا البطل عند توفرها.",paidHero:"إذا دفعت، اختر فقط حزمة تحتوي شظايا هذه الأولوية.",freeLevel:"المكافآت والأحداث والمتاجر المجانية: خبرة الأبطال.",paidLevel:"تجنب الحزم العامة؛ اشترِ خبرة فقط إذا كان فرق المستوى يعيق الفريق 1.",freeExclusive:"الأحداث والمتاجر: شظايا السلاح الحصري.",paidExclusive:"حزمة السلاح الحصري للبطل ذي الأولوية فقط.",freeGear:"الشرف / الأحداث: خامات التطوير ومخططات المعدات.",paidGear:"حزمة المعدات/المخططات فقط إذا كانت المعدات هي العائق الرئيسي.",freeDrone:"الأحداث والمتاجر: مكونات الدرون / بيانات القتال.",paidDrone:"حزمة الدرون فقط بعد الأولويات الأعلى.",freeNone:"لا تنفق قبل اكتمال المسح.",paidNone:"لا يُنصح بشراء مدفوع مع بيانات ناقصة.",focusHold:n=>`لا توزع الموارد على ${n} قبل إصلاح فجوات الفريق الرئيسي ذات الأولوية.`,squadStatusMain:"الأولوية الرئيسية",squadStatusReady:"ثانوي",squadStatusLow:"احتفاظ",squadStatusMissing:"يحتاج مسح",confidence:n=>`الثقة ${n}%`,titles:{scan:"إكمال البيانات",level:"مستوى البطل",stars:"نجوم البطل",exclusive:"السلاح الحصري",gear:"المعدات",drone:"الدرون",focus:"تركيز الموارد"}
  }
};
function heroName(h,i,lang){const n=cleanName(h?.name);if(n&&!/^(hero|héros)\s*\d+$/i.test(n))return n;return lang==="fr"?`Héros ${i+1}`:lang==="es"?`Héroe ${i+1}`:lang==="de"?`Held ${i+1}`:lang==="ja"?`英雄${i+1}`:lang==="zh"?`英雄${i+1}`:lang==="ar"?`البطل ${i+1}`:`Hero ${i+1}`}
function squadName(s,i,lang){const n=cleanName(s?.name);if(n&&!/^(squad|escouade)\s*\d+$/i.test(n))return n;return lang==="fr"?`Escouade ${i+1}`:lang==="es"?`Escuadrón ${i+1}`:lang==="de"?`Trupp ${i+1}`:lang==="ja"?`部隊 ${i+1}`:lang==="zh"?`队伍 ${i+1}`:lang==="ar"?`الفريق ${i+1}`:`Squad ${i+1}`}
function heroDetailCoverage(sq){
  const hs=(sq?.heroes||[]).filter(heroConfigured);if(!hs.length)return 0;
  let fields=0,total=hs.length*5;
  hs.forEach(h=>{if(num(h?.level)!==null)fields++;if(num(h?.stars)!==null)fields++;if(num(h?.power)!==null)fields++;if(cleanName(h?.exclusive))fields++;if(cleanName(h?.gear))fields++});
  return Math.round(fields/total*100);
}
function dataConfidence(squads,drone){
  let score=0,max=0;
  squads.forEach(s=>{max+=20;if(squadConfigured(s))score+=5;if(num(s?.power)!==null)score+=5;const c=heroDetailCoverage(s);score+=c/100*10});
  max+=20;if(num(drone?.level)!==null)score+=10;if(num(drone?.power_m)!==null)score+=10;
  return Math.max(0,Math.min(100,Math.round(score/max*100)));
}
function priority(kind,title,reason,action,buyFree,buyPaid,severity,target){return {kind,title,reason,action,buy_free:buyFree,buy_paid:buyPaid,severity:Math.round(severity),target}}
function buildPlayerAnalysis(state,locale){
  const lang=localePack(locale),p=T[lang],loc=String(locale||"en-GB");
  const squads=Array.from({length:4},(_,i)=>state?.squads?.[i]||{id:i+1,heroes:[]});
  const configured=squads.map((s,i)=>({s,i})).filter(x=>squadConfigured(x.s));
  if(!configured.length)return {summary:p.noSquad,confidence:0,confidence_label:p.confidence(0),priorities:[],squads:squads.map((s,i)=>({id:i+1,name:squadName(s,i,lang),power:null,status:p.squadStatusMissing,data_quality:0,gap_to_main:null})),focus_squad:null};
  const powered=configured.filter(x=>num(x.s.power)!==null).sort((a,b)=>num(b.s.power)-num(a.s.power));
  const main=powered[0]||configured[0],mainPower=num(main.s.power),mainName=squadName(main.s,main.i,lang),heroes=(main.s.heroes||[]).map((h,i)=>({h,i})).filter(x=>heroConfigured(x.h));
  const ps=[];
  const coverage=heroDetailCoverage(main.s);
  if(heroes.length<3||coverage<30){
    ps.push(priority("scan",p.titles.scan,p.needHeroes(mainName),p.actionScan,p.freeNone,p.paidNone,100,mainName));
  }else{
    const levels=heroes.map(x=>num(x.h.level)).filter(x=>x!==null), levelTarget=levels.length?Math.max(...levels):null;
    if(levelTarget!==null){
      heroes.forEach(({h,i})=>{const v=num(h.level);if(v!==null&&levelTarget-v>=3){const gap=levelTarget-v,hn=heroName(h,i,lang);ps.push(priority("level",p.titles.level,p.level(hn,gap,levelTarget),p.actionLevel(hn),p.freeLevel,p.paidLevel,82+Math.min(15,gap*1.5),hn))}})
    }
    heroes.forEach(({h,i})=>{const v=num(h.stars);if(v!==null&&v<5){const gap=Math.max(1,Math.round((5-v)*10)/10),hn=heroName(h,i,lang);ps.push(priority("stars",p.titles.stars,p.stars(hn,gap),p.actionStars(hn),p.freeHero,p.paidHero,92+Math.min(7,gap*3),hn))}})
    const ex=heroes.map(({h})=>metric(h.exclusive)).filter(x=>x!==null), exTarget=ex.length?Math.max(...ex):null;
    if(exTarget!==null&&exTarget>0){heroes.forEach(({h,i})=>{const v=metric(h.exclusive);if(v!==null&&exTarget-v>=2){const gap=Math.round((exTarget-v)*10)/10,hn=heroName(h,i,lang);ps.push(priority("exclusive",p.titles.exclusive,p.exclusive(hn,gap,exTarget),p.actionExclusive(hn),p.freeExclusive,p.paidExclusive,78+Math.min(15,gap*1.5),hn))}})}
    const gears=heroes.map(({h})=>gearMetric(h.gear)).filter(x=>x!==null), gearTarget=gears.length?Math.max(...gears):null;
    if(gearTarget!==null&&gearTarget>0){heroes.forEach(({h,i})=>{const v=gearMetric(h.gear);if(v!==null&&gearTarget-v>=3){const gap=Math.round((gearTarget-v)*10)/10,hn=heroName(h,i,lang);ps.push(priority("gear",p.titles.gear,p.gear(hn,gap,gearTarget),p.actionGear(hn),p.freeGear,p.paidGear,75+Math.min(15,gap),hn))}})}
  }
  const dLevel=num(state?.drone?.level),dPower=num(state?.drone?.power_m);
  if(dLevel!==null||dPower!==null)ps.push(priority("drone",p.titles.drone,p.drone(dLevel,dPower!==null?fmt(dPower,loc):null),p.actionDrone,p.freeDrone,p.paidDrone,45,"Drone"));
  const missing=squads.map((s,i)=>!squadConfigured(s)?squadName(s,i,lang):null).filter(Boolean);
  if(missing.length)ps.push(priority("scan",p.titles.scan,p.scanMissing(missing.join(", ")),p.actionScan,p.freeNone,p.paidNone,42,missing.join(", ")));
  if(powered.length>1){const secondary=powered.slice(1).map(x=>squadName(x.s,x.i,lang)).join(", ");ps.push(priority("focus",p.titles.focus,p.focusHold(secondary),p.focusHold(secondary),p.freeNone,p.paidNone,55,mainName))}
  ps.sort((a,b)=>b.severity-a.severity);
  const dedup=[],seen=new Set();for(const x of ps){const key=`${x.kind}:${x.target}`;if(!seen.has(key)){seen.add(key);dedup.push(x)}if(dedup.length>=4)break}
  dedup.forEach((x,i)=>x.rank=i+1);
  const comparison=squads.map((s,i)=>{
    const power=num(s.power),isMain=i===main.i,ratio=mainPower&&power!==null?power/mainPower:null,dataQ=Math.round((squadConfigured(s)?20:0)+(power!==null?20:0)+heroDetailCoverage(s)*.6);
    let status=p.squadStatusMissing;if(squadConfigured(s))status=isMain?p.squadStatusMain:(ratio!==null&&ratio>=.75?p.squadStatusReady:p.squadStatusLow);
    return {id:i+1,name:squadName(s,i,lang),power,power_label:power!==null?fmt(power,loc):"—",status,data_quality:Math.max(0,Math.min(100,dataQ)),gap_to_main:mainPower&&power!==null?Math.max(0,Math.round((mainPower-power)*100)/100):null};
  });
  const conf=dataConfidence(squads,state?.drone||{}),gapText=dedup[0]?.reason||"";
  return {summary:p.mainDetail(mainName,mainPower!==null?fmt(mainPower,loc):"—",gapText),confidence:conf,confidence_label:p.confidence(conf),priorities:dedup,squads:comparison,focus_squad:main.i+1,engine:"warboost-pro-rules-v1.2.4"};
}
const BASIC={
 fr:{alliance:n=>n?`Utilise les ${Math.min(5,n)} joueurs les plus puissants comme noyau de rally. Répartis ensuite défense, groupe mobile et réserves selon la progression du roster.`:"Fais rejoindre les membres avec l'invitation WarBoost pour créer un plan fiable.",vs:s=>s.opponent?`Jour ${s.day||"—"} contre ${s.opponent} : concentre les ressources sur les actions qui marquent aujourd'hui et conserve le reste pour les jours suivants.`:"WarBoost connaît le jour serveur mais attend encore l'adversaire VS.",season:s=>s.day?`Jour ${s.day} : sécurise d'abord les améliorations saisonnières qui débloquent la prochaine étape. Profession : ${s.profession||"—"}.`:"Scanne ou synchronise la saison pour recevoir un conseil adapté."},
 en:{alliance:n=>n?`Use the ${Math.min(5,n)} strongest players as the rally core, then split defense, mobile group and reserves from the roster progression.`:"Invite members with WarBoost before generating a reliable war plan.",vs:s=>s.opponent?`Day ${s.day||"—"} vs ${s.opponent}: spend only on actions that score today and keep the rest for later days.`:"WarBoost knows the server day but is still waiting for the VS opponent.",season:s=>s.day?`Day ${s.day}: secure the season upgrades that unlock your next step first. Profession: ${s.profession||"—"}.`:"Scan or synchronize the season for day-specific advice."},
 es:{alliance:n=>n?`Usa a los ${Math.min(5,n)} jugadores más fuertes como núcleo de rally y separa defensa, grupo móvil y reservas.`:"Invita miembros con WarBoost antes de generar un plan fiable.",vs:s=>s.opponent?`Día ${s.day||"—"} contra ${s.opponent}: gasta solo en acciones que puntúan hoy.`:"WarBoost conoce el día del servidor pero aún espera el rival VS.",season:s=>s.day?`Día ${s.day}: prioriza las mejoras de temporada que desbloquean tu siguiente paso.`:"Escanea o sincroniza la temporada para recibir un consejo adaptado."},
 de:{alliance:n=>n?`Nutze die ${Math.min(5,n)} stärksten Spieler als Rally-Kern und teile danach Verteidigung, mobile Gruppe und Reserve.`:"Lade Mitglieder über WarBoost ein, bevor du einen Kriegsplan erstellst.",vs:s=>s.opponent?`Tag ${s.day||"—"} gegen ${s.opponent}: Ressourcen nur für heutige Punkte ausgeben.`:"WarBoost kennt den Servertag, wartet aber noch auf den VS-Gegner.",season:s=>s.day?`Tag ${s.day}: priorisiere Saison-Upgrades, die den nächsten Schritt freischalten.`:"Scanne oder synchronisiere die Saison für passende Ratschläge."},
 ja:{alliance:n=>n?`上位${Math.min(5,n)}人をラリー中核にし、防衛・機動・予備に分けます。`:"WarBoost招待でメンバーを参加させてください。",vs:s=>s.opponent?`${s.opponent}との${s.day||"—"}日目：今日得点できる行動に資源を集中。`:"VS相手の同期を待っています。",season:s=>s.day?`${s.day}日目：次の段階を解放するシーズン強化を優先。`:"シーズンをスキャンまたは同期してください。"},
 zh:{alliance:n=>n?`将最强的${Math.min(5,n)}名玩家作为集结核心，再分配防守、机动与预备组。`:"先通过 WarBoost 邀请成员加入。",vs:s=>s.opponent?`第${s.day||"—"}天对阵 ${s.opponent}：只把资源投入今天能得分的项目。`:"WarBoost 已知道服务器日期，但仍在等待 VS 对手。",season:s=>s.day?`第${s.day}天：优先完成能解锁下一阶段的赛季强化。`:"扫描或同步赛季以获得对应建议。"},
 ar:{alliance:n=>n?`استخدم أقوى ${Math.min(5,n)} لاعبين كنواة للرالي، ثم وزّع الدفاع والمجموعة المتحركة والاحتياط.`:"ادعُ الأعضاء عبر WarBoost قبل إنشاء خطة حرب موثوقة.",vs:s=>s.opponent?`اليوم ${s.day||"—"} ضد ${s.opponent}: أنفق فقط على الأنشطة التي تسجل نقاطاً اليوم.`:"WarBoost يعرف يوم الخادم لكنه ينتظر خصم VS.",season:s=>s.day?`اليوم ${s.day}: أعطِ الأولوية لترقيات الموسم التي تفتح الخطوة التالية.`:"امسح أو زامن الموسم للحصول على نصيحة مناسبة."}
};
function basicPack(locale){return BASIC[localePack(locale)]||BASIC.en}
export default function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"method_not_allowed"});
  const scope=String(req.body?.scope||"player"),s=req.body?.state||{},loc=String(req.body?.locale||"en-GB");
  if(scope==="player"){
    const analysis=buildPlayerAnalysis(s,loc);
    return res.status(200).json({ok:true,engine:analysis.engine||"warboost-pro-rules-v1.2.4",advice:analysis.summary,analysis});
  }
  const p=basicPack(loc);let advice;
  if(scope==="alliance")advice=p.alliance((s.alliance?.members||[]).length);else if(scope==="vs")advice=p.vs(s.vs||{});else advice=p.season(s.season||{});
  return res.status(200).json({ok:true,engine:"warboost-rules-v1.2.4",advice});
}
