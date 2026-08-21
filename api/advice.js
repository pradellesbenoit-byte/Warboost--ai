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
  const text=String(v).replaceAll(",",".");
  // Prefer an explicit gear-level token ("Lv.40", "niv.40", etc.).
  // The previous engine could accidentally read the equipment count (e.g. the "4" in "4 équipements niv.40") as the gear level.
  const level=text.match(/(?:lv|niv|level|niveau|stufe|レベル|等级)\s*[.:#-]?\s*(\d+(?:\.\d+)?)/i);
  if(level)return Number(level[1]);
  const matches=text.match(/-?\d+(?:\.\d+)?/g)||[];
  const vals=matches.map(Number).filter(Number.isFinite).filter(x=>x>=10);
  return vals.length?Math.max(...vals):null;
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
    scanMissing:list=>`Il manque encore ${list}. Scanne-les pour que WarBoost compare toutes tes escouades disponibles.`,
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
    level:(h,g,t)=>`${h} is ${g} level${g>1?"s":""} behind the most advanced hero in the squad (observed target: Lv.${t}).`,stars:(h,g)=>`${h} is ${g} star${g>1?"s":""} short of 5★.`,exclusive:(h,g,t)=>`${h}'s exclusive weapon is ${g} level${g>1?"s":""} behind the best visible level (${t}).`,gear:(h,g,t)=>`${h}'s gear is ${g} level${g>1?"s":""} behind the best visible level (${t}).`,drone:(l,p)=>`Drone: ${l?`Lv.${l}`:"level not read"}${p?` · ${p}`:""}. Keep Drone materials after the main-squad gaps above.`,scanMissing:list=>`${list} still need scanning so WarBoost can compare every squad available on your account.`,
    actionLevel:h=>`Raise ${h}'s level first, then rescan to measure the gain.`,actionStars:h=>`Prioritize ${h} shards / universal UR shards until the next star step.`,actionExclusive:h=>`Put exclusive-weapon shards into ${h} before spreading them to another squad.`,actionGear:h=>`Upgrade ${h}'s weakest gear first, then rebalance the 5 heroes.`,actionDrone:"Keep Drone components and battle data in reserve; spend them after the top 1–2 hero gaps.",actionScan:"Do not buy yet: complete the scan first to avoid a bad purchase.",
    freeHero:"Alliance / Honor / event shops: universal UR shards or target-hero shards when available.",paidHero:"If you spend: choose only a pack containing shards for this priority.",freeLevel:"Rewards, events and free shops: Hero EXP / level-up resources.",paidLevel:"Avoid generic packs; buy Hero EXP only if this level gap is truly blocking Squad 1.",freeExclusive:"Events and shops: exclusive-weapon shards when available.",paidExclusive:"Exclusive-weapon pack only for the priority hero; do not split across several heroes.",freeGear:"Honor / event shops: upgrade ore and gear blueprints when available.",paidGear:"Gear/blueprint pack only if gear is the main detected bottleneck.",freeDrone:"Events and shops: Drone components / battle data when available.",paidDrone:"Drone pack only after the hero/gear priorities ranked above.",freeNone:"Spend nothing until the scan is complete.",paidNone:"No paid purchase recommended with incomplete data.",focusHold:n=>`Do not spread resources to ${n} until the main-squad priority gaps are fixed.`,
    squadStatusMain:"Main priority",squadStatusReady:"Secondary",squadStatusLow:"Hold",squadStatusMissing:"Scan needed",confidence:n=>`Confidence ${n}%`,titles:{scan:"Complete the data",level:"Hero level",stars:"Hero stars",exclusive:"Exclusive weapon",gear:"Gear",drone:"Drone",focus:"Resource focus"}
  },
  es:{
    main:(n,p)=>`Concentra tus recursos en ${n} (${p}).`,mainDetail:(n,p,g)=>`Concentra tus recursos en ${n} (${p}). ${g}`,noSquad:"Escanea al menos un escuadrón para activar el diagnóstico PRO.",needHeroes:n=>`Vuelve a escanear ${n} mostrando los 5 héroes. WarBoost necesita niveles, estrellas, armas exclusivas y equipo para ordenar bien las compras.`,level:(h,g,t)=>`${h} está ${g} nivel(es) por detrás del héroe más avanzado (objetivo observado: Nv.${t}).`,stars:(h,g)=>`${h} necesita ${g} estrella(s) para llegar a 5★.`,exclusive:(h,g,t)=>`El arma exclusiva de ${h} está ${g} nivel(es) por debajo del mejor nivel visible (${t}).`,gear:(h,g,t)=>`El equipo de ${h} está ${g} nivel(es) por debajo del mejor nivel visible (${t}).`,drone:(l,p)=>`Dron: ${l?`Nv.${l}`:"nivel no leído"}${p?` · ${p}`:""}. Invierte después de los principales huecos del escuadrón 1.`,scanMissing:l=>`Falta escanear ${l} para comparar todos los escuadrones disponibles en tu cuenta.`,actionLevel:h=>`Sube primero el nivel de ${h} y vuelve a escanear.`,actionStars:h=>`Prioriza fragmentos de ${h} / fragmentos UR universales.`,actionExclusive:h=>`Pon los fragmentos de arma exclusiva en ${h} antes de repartirlos.`,actionGear:h=>`Mejora primero el equipo más débil de ${h}.`,actionDrone:"Reserva componentes y datos del Dron hasta cerrar los 1–2 mayores huecos de héroes.",actionScan:"No compres todavía: completa el escaneo primero.",freeHero:"Tiendas de Alianza / Honor / eventos: fragmentos UR universales o del héroe, si están disponibles.",paidHero:"Si gastas: solo un pack con los fragmentos de esta prioridad.",freeLevel:"Recompensas, eventos y tiendas gratuitas: EXP de héroe.",paidLevel:"Evita packs genéricos; compra EXP solo si este nivel bloquea el escuadrón 1.",freeExclusive:"Eventos y tiendas: fragmentos de arma exclusiva.",paidExclusive:"Pack de arma exclusiva solo para el héroe prioritario.",freeGear:"Honor / eventos: mineral de mejora y planos de equipo.",paidGear:"Pack de equipo/planos solo si el equipo es el cuello de botella.",freeDrone:"Eventos y tiendas: componentes de Dron / datos de combate.",paidDrone:"Pack de Dron solo después de las prioridades anteriores.",freeNone:"No gastes hasta completar el escaneo.",paidNone:"No se recomienda compra de pago con datos incompletos.",focusHold:n=>`No repartas recursos en ${n} hasta corregir las prioridades del escuadrón principal.`,squadStatusMain:"Prioridad principal",squadStatusReady:"Secundario",squadStatusLow:"Conservar",squadStatusMissing:"Escanear",confidence:n=>`Confianza ${n}%`,titles:{scan:"Completar datos",level:"Nivel de héroe",stars:"Estrellas",exclusive:"Arma exclusiva",gear:"Equipo",drone:"Dron",focus:"Concentración"}
  },
  de:{
    main:(n,p)=>`Konzentriere deine Ressourcen auf ${n} (${p}).`,mainDetail:(n,p,g)=>`Konzentriere deine Ressourcen auf ${n} (${p}). ${g}`,noSquad:"Scanne mindestens einen Trupp für die PRO-Diagnose.",needHeroes:n=>`Scanne ${n} erneut, wobei alle 5 Helden sichtbar sind. WarBoost braucht Level, Sterne, Exklusivwaffen und Ausrüstung für eine genaue Kaufreihenfolge.`,level:(h,g,t)=>`${h} liegt ${g} Level hinter dem am weitesten entwickelten Helden (beobachtetes Ziel: Lv.${t}).`,stars:(h,g)=>`${h} fehlen ${g} Stern(e) bis 5★.`,exclusive:(h,g,t)=>`${h}s Exklusivwaffe liegt ${g} Level unter dem besten sichtbaren Wert (${t}).`,gear:(h,g,t)=>`${h}s Ausrüstung liegt ${g} Level unter dem besten sichtbaren Wert (${t}).`,drone:(l,p)=>`Drohne: ${l?`Lv.${l}`:"Level nicht erkannt"}${p?` · ${p}`:""}. Erst nach den Hauptlücken des Haupttrupps investieren.`,scanMissing:l=>`${l} müssen noch gescannt werden, damit alle auf deinem Konto verfügbaren Trupps verglichen werden.`,actionLevel:h=>`Erhöhe zuerst ${h}s Level und scanne danach erneut.`,actionStars:h=>`Priorisiere Fragmente für ${h} / universelle UR-Fragmente.`,actionExclusive:h=>`Exklusivwaffen-Fragmente zuerst in ${h} investieren.`,actionGear:h=>`Verbessere zuerst ${h}s schwächste Ausrüstung.`,actionDrone:"Drohnen-Komponenten und Kampfdaten zurückhalten, bis die größten Heldenlücken geschlossen sind.",actionScan:"Noch nichts kaufen: zuerst den Scan vervollständigen.",freeHero:"Allianz-/Ehre-/Event-Shop: universelle UR- oder Heldenfragmente, falls verfügbar.",paidHero:"Wenn du ausgibst: nur ein Paket mit Fragmenten für diese Priorität.",freeLevel:"Belohnungen, Events und Gratis-Shops: Helden-EXP.",paidLevel:"Keine generischen Pakete; EXP nur kaufen, wenn dieses Levelproblem Trupp 1 blockiert.",freeExclusive:"Events/Shops: Exklusivwaffen-Fragmente.",paidExclusive:"Exklusivwaffen-Paket nur für den Prioritätshelden.",freeGear:"Ehre/Events: Upgrade-Erz und Ausrüstungspläne.",paidGear:"Ausrüstungs-/Blueprint-Paket nur bei erkanntem Ausrüstungsengpass.",freeDrone:"Events/Shops: Drohnen-Komponenten / Kampfdaten.",paidDrone:"Drohnen-Paket erst nach den höher eingestuften Prioritäten.",freeNone:"Bis zum vollständigen Scan nichts ausgeben.",paidNone:"Bei unvollständigen Daten kein Kauf empfohlen.",focusHold:n=>`Ressourcen nicht auf ${n} verteilen, bevor die Hauptlücken des Haupttrupps behoben sind.`,squadStatusMain:"Hauptpriorität",squadStatusReady:"Sekundär",squadStatusLow:"Halten",squadStatusMissing:"Scannen",confidence:n=>`Vertrauen ${n}%`,titles:{scan:"Daten vervollständigen",level:"Heldenlevel",stars:"Sterne",exclusive:"Exklusivwaffe",gear:"Ausrüstung",drone:"Drohne",focus:"Ressourcenfokus"}
  },
  ja:{
    main:(n,p)=>`${n}（${p}）に資源を集中。`,mainDetail:(n,p,g)=>`${n}（${p}）に資源を集中。${g}`,noSquad:"PRO診断を有効にするには少なくとも1部隊をスキャンしてください。",needHeroes:n=>`${n}を5人の英雄が見える画面で再スキャンしてください。レベル、星、専用武器、装備が揃うと購入優先度を正確に判定できます。`,level:(h,g,t)=>`${h}は部隊内の最高レベルより${g}レベル低いです（確認できた目標：Lv.${t}）。`,stars:(h,g)=>`${h}は5★まであと${g}段階です。`,exclusive:(h,g,t)=>`${h}の専用武器は確認できた最高値${t}より${g}レベル低いです。`,gear:(h,g,t)=>`${h}の装備は確認できた最高値${t}より${g}レベル低いです。`,drone:(l,p)=>`ドローン：${l?`Lv.${l}`:"レベル未読"}${p?` · ${p}`:""}。主力部隊の上位ギャップを直した後に投資。`,scanMissing:l=>`${l}が未スキャンです。利用可能な全部隊を比較するため追加してください。`,actionLevel:h=>`${h}のレベルを先に上げ、再スキャンして効果を確認。`,actionStars:h=>`${h}の欠片／UR万能欠片を次の星段階まで優先。`,actionExclusive:h=>`専用武器欠片は他部隊に分散せず${h}を優先。`,actionGear:h=>`${h}の最も弱い装備から強化。`,actionDrone:"ドローン部品と戦闘データは、英雄の上位1～2ギャップを埋めるまで温存。",actionScan:"今は購入しないで、先にスキャンを完成させてください。",freeHero:"同盟／名誉／イベントショップ：UR万能欠片または対象英雄の欠片。",paidHero:"課金する場合、この優先対象の欠片が入るパックだけを選択。",freeLevel:"報酬・イベント・無料ショップ：英雄EXP。",paidLevel:"汎用パックは避け、このレベル差が主力部隊を止める場合のみEXPを購入。",freeExclusive:"イベント／ショップ：専用武器欠片。",paidExclusive:"専用武器パックは優先英雄のみ。",freeGear:"名誉／イベント：強化鉱石と装備設計図。",paidGear:"装備が主ボトルネックの場合のみ装備／設計図パック。",freeDrone:"イベント／ショップ：ドローン部品／戦闘データ。",paidDrone:"上位の英雄・装備優先度の後だけドローンパック。",freeNone:"スキャン完了まで資源を使わない。",paidNone:"データ不足時は有料購入を推奨しません。",focusHold:n=>`主力部隊の優先ギャップが解消するまで${n}へ資源を分散しない。`,squadStatusMain:"主力優先",squadStatusReady:"第2優先",squadStatusLow:"温存",squadStatusMissing:"要スキャン",confidence:n=>`信頼度 ${n}%`,titles:{scan:"データ完成",level:"英雄レベル",stars:"英雄の星",exclusive:"専用武器",gear:"装備",drone:"ドローン",focus:"資源集中"}
  },
  zh:{
    main:(n,p)=>`优先把资源集中到 ${n}（${p}）。`,mainDetail:(n,p,g)=>`优先把资源集中到 ${n}（${p}）。${g}`,noSquad:"至少扫描一支队伍以启用 PRO 诊断。",needHeroes:n=>`请在5名英雄都可见的画面重新扫描 ${n}。WarBoost 需要等级、星级、专武和装备来准确排序购买。`,level:(h,g,t)=>`${h} 比队内最高英雄低 ${g} 级（已观察目标：Lv.${t}）。`,stars:(h,g)=>`${h} 距离5★还差 ${g} 星。`,exclusive:(h,g,t)=>`${h} 的专武比可见最高等级 ${t} 低 ${g} 级。`,gear:(h,g,t)=>`${h} 的装备比可见最高等级 ${t} 低 ${g} 级。`,drone:(l,p)=>`无人机：${l?`Lv.${l}`:"等级未读取"}${p?` · ${p}`:""}。先处理主队上方优先缺口，再投入无人机。`,scanMissing:l=>`${l} 尚未扫描，补齐后才能比较你账号中所有可用队伍。`,actionLevel:h=>`先提升 ${h} 的等级，然后重新扫描确认提升。`,actionStars:h=>`优先 ${h} 碎片／UR万能碎片直到下一星级。`,actionExclusive:h=>`专武碎片优先投入 ${h}，不要分散到其他队伍。`,actionGear:h=>`先强化 ${h} 最弱的装备。`,actionDrone:"保留无人机组件和战斗数据，先解决英雄前1–2个主要缺口。",actionScan:"暂时不要购买：先补全扫描，避免错误消费。",freeHero:"联盟／荣誉／活动商店：UR万能碎片或目标英雄碎片（如有）。",paidHero:"如付费，只选包含当前优先碎片的礼包。",freeLevel:"奖励、活动和免费商店：英雄EXP。",paidLevel:"避免通用礼包；仅当等级差真正卡住1队时购买EXP。",freeExclusive:"活动／商店：专武碎片。",paidExclusive:"专武礼包只给优先英雄，不要分散。",freeGear:"荣誉／活动：强化矿石和装备蓝图。",paidGear:"仅当装备是主要瓶颈时购买装备／蓝图礼包。",freeDrone:"活动／商店：无人机组件／战斗数据。",paidDrone:"在更高优先级的英雄/装备之后再考虑无人机礼包。",freeNone:"扫描完成前不要花资源。",paidNone:"数据不完整时不建议付费购买。",focusHold:n=>`主队优先缺口解决前，不要把资源分散到 ${n}。`,squadStatusMain:"主优先",squadStatusReady:"次优先",squadStatusLow:"保留",squadStatusMissing:"需扫描",confidence:n=>`置信度 ${n}%`,titles:{scan:"补全数据",level:"英雄等级",stars:"英雄星级",exclusive:"专武",gear:"装备",drone:"无人机",focus:"资源集中"}
  },
  ar:{
    main:(n,p)=>`ركّز مواردك على ${n} (${p}).`,mainDetail:(n,p,g)=>`ركّز مواردك على ${n} (${p}). ${g}`,noSquad:"امسح فريقاً واحداً على الأقل لتفعيل تشخيص PRO.",needHeroes:n=>`أعد مسح ${n} على شاشة تظهر الأبطال الخمسة. يحتاج WarBoost إلى المستويات والنجوم والسلاح الحصري والمعدات لترتيب المشتريات بدقة.`,level:(h,g,t)=>`${h} أقل بـ ${g} مستوى من أعلى بطل في الفريق (الهدف المرصود: Lv.${t}).`,stars:(h,g)=>`${h} يحتاج ${g} نجمة للوصول إلى 5★.`,exclusive:(h,g,t)=>`السلاح الحصري لـ ${h} أقل بـ ${g} مستوى من أفضل مستوى ظاهر (${t}).`,gear:(h,g,t)=>`معدات ${h} أقل بـ ${g} مستوى من أفضل مستوى ظاهر (${t}).`,drone:(l,p)=>`الدرون: ${l?`Lv.${l}`:"المستوى غير مقروء"}${p?` · ${p}`:""}. استثمر بعد فجوات الفريق الرئيسي الأعلى.`,scanMissing:l=>`ما زال ${l} بحاجة للمسح لمقارنة كل الفرق المتاحة في حسابك.`,actionLevel:h=>`ارفع مستوى ${h} أولاً ثم أعد المسح لقياس المكسب.`,actionStars:h=>`أعطِ الأولوية لشظايا ${h} / شظايا UR العامة.`,actionExclusive:h=>`ضع شظايا السلاح الحصري في ${h} قبل توزيعها على فريق آخر.`,actionGear:h=>`طوّر أضعف معدات ${h} أولاً.`,actionDrone:"احتفظ بمكونات الدرون وبيانات القتال حتى تعالج أكبر فجوتين للأبطال.",actionScan:"لا تشترِ الآن: أكمل المسح أولاً لتجنب إنفاق خاطئ.",freeHero:"متاجر التحالف / الشرف / الأحداث: شظايا UR عامة أو شظايا البطل عند توفرها.",paidHero:"إذا دفعت، اختر فقط حزمة تحتوي شظايا هذه الأولوية.",freeLevel:"المكافآت والأحداث والمتاجر المجانية: خبرة الأبطال.",paidLevel:"تجنب الحزم العامة؛ اشترِ خبرة فقط إذا كان فرق المستوى يعيق الفريق 1.",freeExclusive:"الأحداث والمتاجر: شظايا السلاح الحصري.",paidExclusive:"حزمة السلاح الحصري للبطل ذي الأولوية فقط.",freeGear:"الشرف / الأحداث: خامات التطوير ومخططات المعدات.",paidGear:"حزمة المعدات/المخططات فقط إذا كانت المعدات هي العائق الرئيسي.",freeDrone:"الأحداث والمتاجر: مكونات الدرون / بيانات القتال.",paidDrone:"حزمة الدرون فقط بعد الأولويات الأعلى.",freeNone:"لا تنفق قبل اكتمال المسح.",paidNone:"لا يُنصح بشراء مدفوع مع بيانات ناقصة.",focusHold:n=>`لا توزع الموارد على ${n} قبل إصلاح فجوات الفريق الرئيسي ذات الأولوية.`,squadStatusMain:"الأولوية الرئيسية",squadStatusReady:"ثانوي",squadStatusLow:"احتفاظ",squadStatusMissing:"يحتاج مسح",confidence:n=>`الثقة ${n}%`,titles:{scan:"إكمال البيانات",level:"مستوى البطل",stars:"نجوم البطل",exclusive:"السلاح الحصري",gear:"المعدات",drone:"الدرون",focus:"تركيز الموارد"}
  }
};
function heroName(h,i,lang){const n=cleanName(h?.name);if(n&&!/^(hero|héros)\s*\d+$/i.test(n))return n;return lang==="fr"?`Héros ${i+1}`:lang==="es"?`Héroe ${i+1}`:lang==="de"?`Held ${i+1}`:lang==="ja"?`英雄${i+1}`:lang==="zh"?`英雄${i+1}`:lang==="ar"?`البطل ${i+1}`:`Hero ${i+1}`}
function squadName(s,i,lang){return lang==="fr"?`Escouade ${i+1}`:lang==="es"?`Escuadrón ${i+1}`:lang==="de"?`Trupp ${i+1}`:lang==="ja"?`部隊 ${i+1}`:lang==="zh"?`队伍 ${i+1}`:lang==="ar"?`الفريق ${i+1}`:`Squad ${i+1}`}
function heroDetailCoverage(sq){
  const hs=(sq?.heroes||[]).filter(heroConfigured);if(!hs.length)return 0;
  let fields=0,total=hs.length*5;
  hs.forEach(h=>{if(num(h?.level)!==null)fields++;if(num(h?.stars)!==null)fields++;if(num(h?.power)!==null)fields++;if(cleanName(h?.exclusive))fields++;if(cleanName(h?.gear))fields++});
  return Math.round(fields/total*100);
}
function optionalSquadStatus(lang){return ({fr:"Optionnelle · à débloquer dans Last War",en:"Optional · unlockable in Last War",es:"Opcional · desbloqueable en Last War",de:"Optional · in Last War freischaltbar",ja:"任意 · Last Warで解放可能",zh:"可选 · 可在 Last War 中解锁",ar:"اختياري · يمكن فتحه في Last War"})[lang]||"Optional · unlockable in Last War"}

const HERO_TYPES={Kimberly:"tank",Williams:"tank",Murphy:"tank",Marshall:"tank",Monica:"tank",Stetmann:"tank",Mason:"tank",Violet:"tank",Scarlett:"tank",Richard:"tank",Gump:"tank",Loki:"tank",DVA:"aircraft",Skyler:"aircraft",Morrison:"aircraft",Lucius:"aircraft",Carlie:"aircraft",Sarah:"aircraft",Maxwell:"aircraft",Cage:"aircraft",Ambolt:"aircraft",Tesla:"missile",Swift:"missile",Fiona:"missile",Adam:"missile",McGregor:"missile",Venom:"missile",Elsa:"missile",Blaz:"missile",Kane:"missile"};
function squadTypeFromHeroes(heroes){const c={aircraft:0,tank:0,missile:0};for(const x of heroes){const t=HERO_TYPES[cleanName(x?.h?.name||x?.name)];if(t)c[t]++}return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[1]>=3?Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]:null}
const AIR_EW_TO20={DVA:100,Lucius:97,Skyler:95,Morrison:93,Carlie:80};
const AIR_EW_TO30={DVA:100,Lucius:96,Morrison:91,Skyler:89,Carlie:76};
function ewPriorityWeight(name,type,target){if(type==="aircraft")return (target===20?AIR_EW_TO20:AIR_EW_TO30)[name]||75;if(type==="tank")return ({Kimberly:100,Murphy:95,Marshall:88}[name]||78);if(type==="missile")return ({Tesla:100,Fiona:94,McGregor:88,Adam:84,Swift:80}[name]||78);return 80}
const EW_TEXT={
fr:(h,c,t)=>`${h} est à EX${c}. Le prochain palier efficace est EX${t} ; WarBoost privilégie les paliers 10/20/30 plutôt qu'un simple égalisage de niveaux.`,
en:(h,c,t)=>`${h} is at EX${c}. The next efficient breakpoint is EX${t}; WarBoost prioritizes 10/20/30 breakpoints rather than simple level matching.`,
es:(h,c,t)=>`${h} está en EX${c}. El siguiente punto eficiente es EX${t}; WarBoost prioriza los hitos 10/20/30 en lugar de igualar niveles.`,
de:(h,c,t)=>`${h} ist auf EX${c}. Der nächste effiziente Meilenstein ist EX${t}; WarBoost priorisiert 10/20/30 statt reines Angleichen.`,
ja:(h,c,t)=>`${h} は EX${c}。次の効率的な節目は EX${t}。WarBoost は単純な均等化より 10/20/30 の節目を優先します。`,
zh:(h,c,t)=>`${h} 当前 EX${c}。下一个高效节点是 EX${t}；WarBoost 优先 10/20/30 节点，而不是简单拉平等级。`,
ar:(h,c,t)=>`${h} عند EX${c}. نقطة الكفاءة التالية هي EX${t}؛ يعطي WarBoost الأولوية لمراحل 10/20/30 بدلاً من مساواة المستويات فقط.`};
function ewReason(locale,h,c,t){return (EW_TEXT[localePack(locale)]||EW_TEXT.en)(h,c,t)}
function dataConfidence(squads,drone){
  let score=0,max=0;
  squads.forEach((s,i)=>{if(i===3&&!squadConfigured(s))return;max+=20;if(squadConfigured(s))score+=5;if(num(s?.power)!==null)score+=5;const c=heroDetailCoverage(s);score+=c/100*10});
  max+=20;if(num(drone?.level)!==null)score+=10;if(num(drone?.power_m)!==null)score+=10;
  return max?Math.max(0,Math.min(100,Math.round(score/max*100))):0;
}
function priority(kind,title,reason,action,buyFree,buyPaid,severity,target){return {kind,title,reason,action,buy_free:buyFree,buy_paid:buyPaid,severity:Math.round(severity),target}}
function buildPlayerAnalysis(state,locale){
  const lang=localePack(locale),p=T[lang],loc=String(locale||"en-GB");
  const squads=Array.from({length:4},(_,i)=>state?.squads?.[i]||{id:i+1,heroes:[]});
  const configured=squads.map((s,i)=>({s,i})).filter(x=>squadConfigured(x.s));
  if(!configured.length)return {summary:p.noSquad,confidence:0,confidence_label:p.confidence(0),priorities:[],squads:squads.map((s,i)=>({id:i+1,name:squadName(s,i,lang),power:null,status:i===3?optionalSquadStatus(lang):p.squadStatusMissing,data_quality:0,gap_to_main:null,optional:i===3})),focus_squad:null};
  const powered=configured.filter(x=>num(x.s.power)!==null).sort((a,b)=>num(b.s.power)-num(a.s.power));
  const main=powered[0]||configured[0],mainPower=num(main.s.power),mainName=squadName(main.s,main.i,lang);
  const weaponList=Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[];
  const weaponByHero=name=>weaponList.find(w=>cleanName(w?.hero_name).toLowerCase()===cleanName(name).toLowerCase());
  const enhancedHeroes=(main.s.heroes||[]).map(h=>{const w=weaponByHero(h?.name);return w&&num(w.level)!==null?{...h,exclusive:String(w.level)}:h});
  const heroes=enhancedHeroes.map((h,i)=>({h,i})).filter(x=>heroConfigured(x.h));
  const ps=[];
  const coverage=heroDetailCoverage({...main.s,heroes:enhancedHeroes});
  if(heroes.length<3||coverage<30){
    ps.push(priority("scan",p.titles.scan,p.needHeroes(mainName),p.actionScan,p.freeNone,p.paidNone,100,mainName));
  }else{
    const levels=heroes.map(x=>num(x.h.level)).filter(x=>x!==null), levelTarget=levels.length?Math.max(...levels):null;
    if(levelTarget!==null){
      heroes.forEach(({h,i})=>{const v=num(h.level);if(v!==null&&levelTarget-v>=3){const gap=levelTarget-v,hn=heroName(h,i,lang);ps.push(priority("level",p.titles.level,p.level(hn,gap,levelTarget),p.actionLevel(hn),p.freeLevel,p.paidLevel,82+Math.min(15,gap*1.5),hn))}})
    }
    heroes.forEach(({h,i})=>{const v=num(h.stars);if(v!==null&&v<5){const gap=Math.max(1,Math.round((5-v)*10)/10),hn=heroName(h,i,lang);ps.push(priority("stars",p.titles.stars,p.stars(hn,gap),p.actionStars(hn),p.freeHero,p.paidHero,92+Math.min(7,gap*3),hn))}})
    const exRows=heroes.map(({h,i})=>({h,i,v:metric(h.exclusive),name:heroName(h,i,lang)})).filter(x=>x.v!==null&&x.v>=0), squadType=squadTypeFromHeroes(heroes);
    if(exRows.length){
      const below20=exRows.filter(x=>x.v<20).sort((a,b)=>ewPriorityWeight(b.name,squadType,20)-ewPriorityWeight(a.name,squadType,20)||(a.v-b.v));
      if(below20.length){for(const x of below20){const sev=Math.min(99,82+ewPriorityWeight(x.name,squadType,20)*.12+(20-x.v)*.25);ps.push(priority("exclusive",p.titles.exclusive,ewReason(locale,x.name,x.v,20),p.actionExclusive(x.name),p.freeExclusive,p.paidExclusive,sev,x.name))}}
      else{
        const below30=exRows.filter(x=>x.v<30).sort((a,b)=>ewPriorityWeight(b.name,squadType,30)-ewPriorityWeight(a.name,squadType,30)||(a.v-b.v));
        for(const x of below30.slice(0,3)){const sev=Math.min(96,76+ewPriorityWeight(x.name,squadType,30)*.12+(30-x.v)*.18);ps.push(priority("exclusive",p.titles.exclusive,ewReason(locale,x.name,x.v,30),p.actionExclusive(x.name),p.freeExclusive,p.paidExclusive,sev,x.name))}
      }
    }
    const gears=heroes.map(({h})=>gearMetric(h.gear)).filter(x=>x!==null), gearTarget=gears.length?Math.max(...gears):null;
    if(gearTarget!==null&&gearTarget>0){heroes.forEach(({h,i})=>{const v=gearMetric(h.gear);if(v!==null&&gearTarget-v>=3){const gap=Math.round((gearTarget-v)*10)/10,hn=heroName(h,i,lang);ps.push(priority("gear",p.titles.gear,p.gear(hn,gap,gearTarget),p.actionGear(hn),p.freeGear,p.paidGear,75+Math.min(15,gap),hn))}})}
  }
  const dLevel=num(state?.drone?.level),dPower=num(state?.drone?.power_m);
  if(dLevel!==null||dPower!==null)ps.push(priority("drone",p.titles.drone,p.drone(dLevel,dPower!==null?fmt(dPower,loc):null),p.actionDrone,p.freeDrone,p.paidDrone,45,"Drone"));
  const missing=squads.map((s,i)=>i<3&&!squadConfigured(s)?squadName(s,i,lang):null).filter(Boolean);
  if(missing.length)ps.push(priority("scan",p.titles.scan,p.scanMissing(missing.join(", ")),p.actionScan,p.freeNone,p.paidNone,42,missing.join(", ")));
  if(powered.length>1){const secondary=powered.slice(1).map(x=>squadName(x.s,x.i,lang)).join(", ");ps.push(priority("focus",p.titles.focus,p.focusHold(secondary),p.focusHold(secondary),p.freeNone,p.paidNone,55,mainName))}
  ps.sort((a,b)=>b.severity-a.severity);
  const dedup=[],seen=new Set();for(const x of ps){const key=`${x.kind}:${x.target}`;if(!seen.has(key)){seen.add(key);dedup.push(x)}if(dedup.length>=4)break}
  dedup.forEach((x,i)=>x.rank=i+1);
  const comparison=squads.map((s,i)=>{
    const power=num(s.power),configuredHere=squadConfigured(s),optional=i===3&&!configuredHere,isMain=i===main.i,ratio=mainPower&&power!==null?power/mainPower:null,dataQ=Math.round((configuredHere?20:0)+(power!==null?20:0)+heroDetailCoverage(s)*.6);
    let status=optional?optionalSquadStatus(lang):p.squadStatusMissing;if(configuredHere)status=isMain?p.squadStatusMain:(ratio!==null&&ratio>=.75?p.squadStatusReady:p.squadStatusLow);
    return {id:i+1,name:squadName(s,i,lang),power,power_label:power!==null?fmt(power,loc):"—",status,data_quality:Math.max(0,Math.min(100,dataQ)),gap_to_main:mainPower&&power!==null?Math.max(0,Math.round((mainPower-power)*100)/100):null,optional};
  });
  const conf=dataConfidence(squads,state?.drone||{}),gapText=dedup[0]?.reason||"";
  return {summary:p.mainDetail(mainName,mainPower!==null?fmt(mainPower,loc):"—",gapText),confidence:conf,confidence_label:p.confidence(conf),priorities:dedup,squads:comparison,focus_squad:main.i+1,engine:"warboost-pro-shop-v1.3.3"};
}

// ===== V1.3.3 · Last War Shop Advisor =====
const SHOP_TEXT={
  fr:{buy:"À prendre",consider:"Si surplus",skip:"À éviter",scanSummary:(store,n)=>`Boutique scannée : ${store}. WarBoost a classé ${n} offre${n>1?"s":""} visible${n>1?"s":""} selon les besoins réels de ton compte.`,rulesSummary:"Conseils calculés depuis tes escouades. Scanne une boutique Last War pour classer les offres visibles et leurs prix.",honorBp:"Plan d’équipement légendaire",campaignEx:"Fragments universels d’arme exclusive",allianceHero:"Fragments UR / héros prioritaire",allianceDrone:"Pièces et composants de Drone",vipStamina:"Endurance de la boutique VIP",speed:"Accélérateurs recherche/construction",shield:"Bouclier avant combat / VS",paidExclusive:"Pack d’arme exclusive ciblé",paidGear:"Pack plans / équipement ciblé",paidDrone:"Pack Drone ciblé",resources:"Packs de ressources génériques",reasonBlueprint:"Ressource rare et durable pour la progression des équipements : priorité élevée dans la Boutique Honneur.",reasonExclusive:t=>`Ton plus gros écart visible est l’arme exclusive. Concentre les fragments sur ${t||"le héros prioritaire"} au lieu de les disperser.`,reasonHero:t=>`À privilégier seulement si ${t||"un héros de l’escouade principale"} n’est pas encore au palier d’étoiles visé.`,reasonDrone:"Bon achat après les principaux écarts héros / arme exclusive / équipement.",reasonStamina:"Bon rendement hebdomadaire pour événements, campagne et progression ; n’achète pas au détriment d’un goulot rare.",reasonSpeed:"Utile quand un objectif recherche/construction est actif ou pour marquer des points au bon jour VS.",reasonShield:"Achat situationnel : utile avant une journée combat/VS, inutile à stocker en excès.",reasonPaid:t=>`Si tu dépenses, prends uniquement un pack qui résout directement le goulot ${t}. Évite les packs génériques.`,reasonResource:"Les ressources génériques sont généralement remplaçables par le jeu : faible priorité face aux objets rares.",reasonVisible:"Offre visible classée selon ton profil WarBoost et le type d’objet détecté.",target:"Cible"},
  en:{buy:"Buy",consider:"If surplus",skip:"Skip",scanSummary:(store,n)=>`Scanned shop: ${store}. WarBoost ranked ${n} visible offer${n===1?"":"s"} against your real account needs.`,rulesSummary:"Advice is calculated from your squads. Scan a Last War shop to rank the visible offers and prices.",honorBp:"Legendary Gear Blueprint",campaignEx:"Universal Exclusive Weapon Shards",allianceHero:"UR / priority-hero shards",allianceDrone:"Drone Parts & Components",vipStamina:"VIP Store Stamina",speed:"Research / construction speed-ups",shield:"Shield before combat / VS",paidExclusive:"Targeted exclusive-weapon pack",paidGear:"Targeted gear / blueprint pack",paidDrone:"Targeted Drone pack",resources:"Generic resource packs",reasonBlueprint:"Rare, durable gear progression resource: very high priority in the Honor Shop.",reasonExclusive:t=>`Your largest visible gap is exclusive weapons. Focus shards on ${t||"the priority hero"} instead of spreading them.`,reasonHero:t=>`Prioritize only if ${t||"a main-squad hero"} still needs the next star step.`,reasonDrone:"Good after the main hero / exclusive-weapon / gear gaps.",reasonStamina:"Strong weekly value for events, campaign and progression; do not sacrifice a rarer bottleneck for it.",reasonSpeed:"Useful when a research/build objective is active or to score on the right VS day.",reasonShield:"Situational: useful before combat/VS, not worth excessive stockpiling.",reasonPaid:t=>`If you spend, buy only a pack that directly solves the ${t} bottleneck. Avoid generic bundles.`,reasonResource:"Generic resources are usually replaceable through play, so they rank below scarce progression items.",reasonVisible:"Visible offer ranked from your WarBoost profile and the detected item type.",target:"Target"},
  es:{buy:"Comprar",consider:"Si sobra",skip:"Evitar",scanSummary:(store,n)=>`Tienda escaneada: ${store}. WarBoost clasificó ${n} oferta(s) visible(s) según las necesidades reales de tu cuenta.`,rulesSummary:"Los consejos se calculan desde tus escuadrones. Escanea una tienda Last War para clasificar ofertas y precios visibles.",honorBp:"Plano de equipo legendario",campaignEx:"Fragmentos universales de arma exclusiva",allianceHero:"Fragmentos UR / héroe prioritario",allianceDrone:"Piezas y componentes de Dron",vipStamina:"Energía de tienda VIP",speed:"Aceleradores de investigación/construcción",shield:"Escudo antes de combate / VS",paidExclusive:"Pack dirigido de arma exclusiva",paidGear:"Pack dirigido de planos/equipo",paidDrone:"Pack dirigido de Dron",resources:"Packs de recursos genéricos",reasonBlueprint:"Recurso raro y duradero para el equipo: prioridad muy alta en la Tienda de Honor.",reasonExclusive:t=>`El mayor hueco visible está en armas exclusivas. Concentra fragmentos en ${t||"el héroe prioritario"}.`,reasonHero:t=>`Prioriza solo si ${t||"un héroe principal"} necesita el siguiente nivel de estrellas.`,reasonDrone:"Buena compra después de cerrar huecos principales de héroes, armas exclusivas y equipo.",reasonStamina:"Buen valor semanal para eventos y campaña.",reasonSpeed:"Útil con un objetivo activo de investigación/construcción o para el día VS correcto.",reasonShield:"Situacional: útil antes de combate/VS.",reasonPaid:t=>`Si gastas, compra solo un pack que resuelva directamente el cuello de botella ${t}.`,reasonResource:"Los recursos genéricos suelen conseguirse jugando; baja prioridad frente a objetos raros.",reasonVisible:"Oferta visible clasificada según tu perfil y el tipo de objeto detectado.",target:"Objetivo"},
  de:{buy:"Kaufen",consider:"Bei Überschuss",skip:"Auslassen",scanSummary:(store,n)=>`Shop gescannt: ${store}. WarBoost hat ${n} sichtbare Angebote nach deinem echten Kontobedarf bewertet.`,rulesSummary:"Die Empfehlungen werden aus deinen Trupps berechnet. Scanne einen Last-War-Shop, um sichtbare Angebote und Preise zu bewerten.",honorBp:"Legendärer Ausrüstungsbauplan",campaignEx:"Universelle Exklusivwaffen-Fragmente",allianceHero:"UR-/Prioritätsheld-Fragmente",allianceDrone:"Drohnen-Teile & Komponenten",vipStamina:"VIP-Shop Ausdauer",speed:"Forschungs-/Bau-Beschleuniger",shield:"Schild vor Kampf / VS",paidExclusive:"Gezieltes Exklusivwaffen-Paket",paidGear:"Gezieltes Ausrüstungs-/Bauplan-Paket",paidDrone:"Gezieltes Drohnen-Paket",resources:"Allgemeine Ressourcenpakete",reasonBlueprint:"Seltene, dauerhafte Ausrüstungsressource: sehr hohe Priorität im Ehren-Shop.",reasonExclusive:t=>`Die größte sichtbare Lücke liegt bei Exklusivwaffen. Fragmente auf ${t||"den Prioritätshelden"} konzentrieren.`,reasonHero:t=>`Nur priorisieren, wenn ${t||"ein Hauptheld"} noch den nächsten Sternschritt braucht.`,reasonDrone:"Gut nach den wichtigsten Helden-, Exklusivwaffen- und Ausrüstungslücken.",reasonStamina:"Guter Wochenwert für Events und Kampagne.",reasonSpeed:"Nützlich bei aktivem Forschungs-/Bauziel oder am passenden VS-Tag.",reasonShield:"Situativ vor Kampf/VS nützlich.",reasonPaid:t=>`Bei Echtgeld nur Pakete kaufen, die den Engpass ${t} direkt lösen.`,reasonResource:"Allgemeine Ressourcen sind ersetzbar und stehen hinter seltenen Fortschrittsobjekten.",reasonVisible:"Sichtbares Angebot anhand deines WarBoost-Profils bewertet.",target:"Ziel"},
  ja:{buy:"優先購入",consider:"余裕があれば",skip:"見送り",scanSummary:(store,n)=>`ショップ解析：${store}。表示中の${n}件をアカウントの実際の不足に合わせて順位付けしました。`,rulesSummary:"部隊データから購入優先度を計算。ショップをスキャンすると表示中の商品と価格を直接評価できます。",honorBp:"レジェンダリー装備設計図",campaignEx:"万能専用武器欠片",allianceHero:"UR／優先英雄の欠片",allianceDrone:"ドローン部品・コンポーネント",vipStamina:"VIPショップ体力",speed:"研究／建造加速",shield:"戦闘・VS前のシールド",paidExclusive:"専用武器ターゲットパック",paidGear:"装備／設計図ターゲットパック",paidDrone:"ドローンターゲットパック",resources:"汎用資源パック",reasonBlueprint:"装備強化の希少で長期価値が高い資源。名誉ショップで高優先。",reasonExclusive:t=>`最大の不足は専用武器。${t||"優先英雄"}に欠片を集中。`,reasonHero:t=>`${t||"主力英雄"}が次の星段階を必要とする場合のみ優先。`,reasonDrone:"英雄・専用武器・装備の上位不足を埋めた後に有効。",reasonStamina:"イベントやキャンペーンに使える安定した週次価値。",reasonSpeed:"研究・建造目標やVS得点日に有効。",reasonShield:"戦闘・VS前だけ高価値。",reasonPaid:t=>`課金するなら${t}の不足を直接解消するパックだけを選択。`,reasonResource:"汎用資源はゲーム内で代替しやすく、希少素材より優先度が低い。",reasonVisible:"表示中の商品をWarBoostプロフィールに基づき評価。",target:"対象"},
  zh:{buy:"优先购买",consider:"有余量再买",skip:"跳过",scanSummary:(store,n)=>`已扫描商店：${store}。WarBoost 根据账号真实缺口对 ${n} 个可见商品排序。`,rulesSummary:"建议来自你的队伍数据。扫描 Last War 商店后可直接评估可见商品和价格。",honorBp:"传奇装备蓝图",campaignEx:"通用专属武器碎片",allianceHero:"UR / 主力英雄碎片",allianceDrone:"无人机零件与组件",vipStamina:"VIP 商店体力",speed:"科研 / 建造加速",shield:"战斗 / VS 前护盾",paidExclusive:"定向专属武器礼包",paidGear:"定向装备 / 蓝图礼包",paidDrone:"定向无人机礼包",resources:"通用资源礼包",reasonBlueprint:"装备成长的稀缺长期资源，在荣誉商店优先级很高。",reasonExclusive:t=>`当前最大可见缺口是专属武器。碎片集中给 ${t||"主力英雄"}，不要分散。`,reasonHero:t=>`仅当 ${t||"主力英雄"} 尚未达到目标星级时优先。`,reasonDrone:"在英雄、专属武器和装备主要缺口之后购买。",reasonStamina:"活动、战役和日常成长的稳定周价值。",reasonSpeed:"有科研/建造目标或正确 VS 日期时有价值。",reasonShield:"战斗/VS 前的情境购买。",reasonPaid:t=>`如需付费，只购买能直接解决 ${t} 瓶颈的礼包。`,reasonResource:"通用资源较容易通过游戏获得，优先级低于稀缺成长材料。",reasonVisible:"根据 WarBoost 账号资料对当前可见商品进行排序。",target:"目标"},
  ar:{buy:"اشترِ",consider:"عند توفر فائض",skip:"تجنب",scanSummary:(store,n)=>`تم مسح المتجر: ${store}. صنّف WarBoost ${n} عرضاً ظاهراً حسب احتياجات حسابك الفعلية.`,rulesSummary:"تُحسب النصائح من بيانات فرقك. امسح متجر Last War لتقييم العروض والأسعار الظاهرة مباشرة.",honorBp:"مخطط عتاد أسطوري",campaignEx:"شظايا سلاح حصري عامة",allianceHero:"شظايا UR / البطل ذي الأولوية",allianceDrone:"قطع ومكونات الدرون",vipStamina:"طاقة متجر VIP",speed:"تسريعات البحث/البناء",shield:"درع قبل القتال / VS",paidExclusive:"حزمة سلاح حصري مستهدفة",paidGear:"حزمة عتاد/مخططات مستهدفة",paidDrone:"حزمة درون مستهدفة",resources:"حزم موارد عامة",reasonBlueprint:"مورد نادر وطويل الأجل لتطوير العتاد؛ أولوية عالية في متجر الشرف.",reasonExclusive:t=>`أكبر فجوة ظاهرة هي السلاح الحصري. ركّز الشظايا على ${t||"البطل ذي الأولوية"}.`,reasonHero:t=>`أعطِ الأولوية فقط إذا كان ${t||"بطل الفريق الرئيسي"} يحتاج مستوى النجوم التالي.`,reasonDrone:"شراء جيد بعد سد فجوات الأبطال والأسلحة الحصرية والعتاد الأساسية.",reasonStamina:"قيمة أسبوعية جيدة للأحداث والحملة.",reasonSpeed:"مفيد مع هدف بحث/بناء نشط أو يوم VS المناسب.",reasonShield:"مفيد حسب الحاجة قبل القتال/VS.",reasonPaid:t=>`إذا دفعت، اشترِ فقط حزمة تحل مباشرة اختناق ${t}.`,reasonResource:"الموارد العامة يمكن تعويضها باللعب، لذلك أولوية أقل من المواد النادرة.",reasonVisible:"تم ترتيب العرض الظاهر وفق ملف WarBoost ونوع العنصر المكتشف.",target:"الهدف"}
};
function shopText(locale){return SHOP_TEXT[localePack(locale)]||SHOP_TEXT.en}
const SHOP_STORES={fr:{honor:"Boutique Honneur",campaign:"Boutique Campagne",alliance:"Boutique Alliance",vip:"Boutique VIP",paid:"Boutique payante",allianceCampaign:"Alliance / Campagne",vipAlliance:"VIP / Alliance",allianceDiamond:"Alliance / Diamants",diamondPaid:"Diamants / boutique payante"},en:{honor:"Honor Shop",campaign:"Campaign Store",alliance:"Alliance Store",vip:"VIP Shop",paid:"Paid shop",allianceCampaign:"Alliance / Campaign",vipAlliance:"VIP / Alliance",allianceDiamond:"Alliance / Diamond",diamondPaid:"Diamond / paid shop"},es:{honor:"Tienda de Honor",campaign:"Tienda de Campaña",alliance:"Tienda de Alianza",vip:"Tienda VIP",paid:"Tienda de pago",allianceCampaign:"Alianza / Campaña",vipAlliance:"VIP / Alianza",allianceDiamond:"Alianza / Diamantes",diamondPaid:"Diamantes / tienda de pago"},de:{honor:"Ehren-Shop",campaign:"Kampagnen-Shop",alliance:"Allianz-Shop",vip:"VIP-Shop",paid:"Bezahl-Shop",allianceCampaign:"Allianz / Kampagne",vipAlliance:"VIP / Allianz",allianceDiamond:"Allianz / Diamanten",diamondPaid:"Diamanten / Bezahl-Shop"},ja:{honor:"名誉ショップ",campaign:"キャンペーンショップ",alliance:"同盟ショップ",vip:"VIPショップ",paid:"課金ショップ",allianceCampaign:"同盟 / キャンペーン",vipAlliance:"VIP / 同盟",allianceDiamond:"同盟 / ダイヤ",diamondPaid:"ダイヤ / 課金ショップ"},zh:{honor:"荣誉商店",campaign:"战役商店",alliance:"联盟商店",vip:"VIP 商店",paid:"付费商店",allianceCampaign:"联盟 / 战役",vipAlliance:"VIP / 联盟",allianceDiamond:"联盟 / 钻石",diamondPaid:"钻石 / 付费商店"},ar:{honor:"متجر الشرف",campaign:"متجر الحملة",alliance:"متجر التحالف",vip:"متجر VIP",paid:"المتجر المدفوع",allianceCampaign:"التحالف / الحملة",vipAlliance:"VIP / التحالف",allianceDiamond:"التحالف / الألماس",diamondPaid:"الألماس / المتجر المدفوع"}};
function shopStores(locale){return SHOP_STORES[localePack(locale)]||SHOP_STORES.en}
function heroNeedSnapshot(state){
  const squads=Array.from({length:4},(_,i)=>state?.squads?.[i]||{heroes:[]});
  const powered=squads.map((s,i)=>({s,i,p:num(s?.power)})).filter(x=>x.p!==null).sort((a,b)=>b.p-a.p);
  const main=powered[0]||squads.map((s,i)=>({s,i,p:num(s?.power)})).find(x=>squadConfigured(x.s));
  const sq=main?.s||{heroes:[]},weapons=Array.isArray(state?.exclusive_weapons)?state.exclusive_weapons:[];
  const weaponLevel=n=>num(weapons.find(w=>cleanName(w?.hero_name).toLowerCase()===cleanName(n).toLowerCase())?.level);
  const heroes=(sq.heroes||[]).filter(heroConfigured).map((h,i)=>({name:cleanName(h?.name)||`Hero ${i+1}`,stars:num(h?.stars),level:num(h?.level),exclusive:weaponLevel(h?.name)??metric(h?.exclusive),gear:gearMetric(h?.gear),gear_text:cleanName(h?.gear)}));
  const starTargets=heroes.filter(h=>h.stars!==null&&h.stars<5).sort((a,b)=>a.stars-b.stars);
  const exKnown=heroes.filter(h=>h.exclusive!==null),typeCounts={aircraft:0,tank:0,missile:0};
  for(const h of heroes){const t=HERO_TYPES[h.name];if(t)typeCounts[t]++}
  const typeRows=Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]),squadType=typeRows[0]?.[1]>=3?typeRows[0][0]:null;
  const under20=exKnown.filter(h=>h.exclusive<20).sort((a,b)=>ewPriorityWeight(b.name,squadType,20)-ewPriorityWeight(a.name,squadType,20)||(a.exclusive-b.exclusive));
  const under30=exKnown.filter(h=>h.exclusive>=20&&h.exclusive<30).sort((a,b)=>ewPriorityWeight(b.name,squadType,30)-ewPriorityWeight(a.name,squadType,30)||(a.exclusive-b.exclusive));
  const exTargets=under20.length?under20:under30;
  const gearKnown=heroes.filter(h=>h.gear!==null),gearMax=gearKnown.length?Math.max(...gearKnown.map(h=>h.gear)):null;
  const gearTargets=gearKnown.filter(h=>h.gear<40||(gearMax!==null&&gearMax-h.gear>=3)).sort((a,b)=>a.gear-b.gear);
  const levelKnown=heroes.filter(h=>h.level!==null),levelMax=levelKnown.length?Math.max(...levelKnown.map(h=>h.level)):null;
  const levelTargets=levelKnown.filter(h=>levelMax!==null&&levelMax-h.level>=3);
  const lowestEx=exKnown.length?Math.min(...exKnown.map(h=>h.exclusive)):null;
  const exclusiveUrgency=lowestEx===null?.35:lowestEx<10?1:lowestEx<20?.92:lowestEx<30?.68:.35;
  const starsUrgency=starTargets.length?Math.min(1,.72+starTargets.length*.07):.12;
  const at40=gearKnown.filter(h=>h.gear>=40).length;
  const gearUrgency=gearTargets.length?Math.min(1,.7+gearTargets.length*.06):(at40>=3?.58:gearKnown.length?.42:.3);
  const droneLevel=num(state?.drone?.level),droneKnown=droneLevel!==null||num(state?.drone?.power_m)!==null;
  const droneUrgency=!droneKnown?.38:droneLevel===null?.55:droneLevel<100?.9:droneLevel<150?.76:droneLevel<200?.64:.52;
  return {main_squad:(main?.i??0)+1,heroes,squadType,starTargets,exTargets,gearTargets,levelTargets,needExclusive:exTargets.length>0,needStars:starTargets.length>0,needGear:gearTargets.length>0,needLevel:levelTargets.length>0,exclusiveUrgency,starsUrgency,gearUrgency,droneUrgency,droneKnown,droneLevel,gearKnownCount:gearKnown.length,exclusiveKnownCount:exKnown.length};
}
function normItem(v){return cleanName(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function itemCategory(name,explicitCategory=""){const s=normItem(`${name||""} ${explicitCategory||""}`);
  if(/vip.*(30|day|jour|dia|tag|日)|30.*vip|vip.*time|vip.*temps|vip.*zeit/.test(s))return "vip_time";
  if(/mythic.*blueprint|mythical.*blueprint|legendary.*blueprint|blueprint|plan.*equip|equip.*plan|equip.*blueprint|memoire.*equip|装備.*レシピ|装备.*蓝图/.test(s))return "blueprint";
  if(/exclusive.*weapon|weapon.*shard|arme.*exclusive|fragment.*arme|专属武器|専用武器/.test(s))return "exclusive";
  if(/universal.*(legendary|ur).*shard|ur.*shard|golden.*shard|fragment.*ur|hero.*shard|英雄.*碎片/.test(s))return "hero";
  if(/drone.*(chip|component|part|gear)|component.*drone|part.*drone|piece.*drone|drone|drohne|dron|无人机|ドローン|درون/.test(s))return "drone";
  if(/stamina|endurance|\bap\b|energie|energy|体力|طاقة/.test(s))return "stamina";
  if(/armament|兵装|overlord|bond badge|badge.*bond|连携|連携/.test(s))return "armament";
  if(/skill.*chip|chip.*skill|skill.*medal|medaille.*compet|技能.*芯片|スキル.*チップ/.test(s))return "skill";
  if(/healing.*speed|heal.*speed|soin.*acceler|加速.*治疗/.test(s))return "speed_heal";
  if(/research.*speed|science.*speed|recherche.*acceler|forsch.*beschleun|研究.*加速/.test(s))return "speed_research";
  if(/construct.*speed|build.*speed|construction.*acceler|bau.*beschleun|建造.*加速/.test(s))return "speed_build";
  if(/train.*speed|training.*speed|entrain.*acceler|ausbild.*beschleun|训练.*加速/.test(s))return "speed_train";
  if(/speed|acceler|beschleun|加速|تسريع/.test(s))return "speed";
  if(/shield|bouclier|schild|护盾|シールド|درع/.test(s))return "shield";
  if(/teleport|teleporteur|teleporter|迁城|テレポート/.test(s))return "teleport";
  if(/campaign.*chest|coffre.*campagne|expedition.*chest|远征.*宝箱|遠征.*宝箱/.test(s))return "campaign_chest";
  if(/resource|ressource|gold|iron|fer|food|nourriture|coin|pieces|资源|資源|موارد/.test(s))return "resource";
  if(/decor|skin|cosmetic|decoration|装饰|スキン/.test(s))return "cosmetic";
  if(/chest|coffre|宝箱|ボックス/.test(s))return "chest";
  return "other";
}
function storeKind(v){const s=normItem(v);if(/honor|honneur|ehre|荣誉|名誉|الشرف/.test(s))return "honor";if(/campaign|campagne|战役|キャンペーン|الحملة/.test(s))return "campaign";if(/alliance|allianz|联盟|同盟|التحالف/.test(s))return "alliance";if(/vip/.test(s))return "vip";if(/diamond|diamant|diamante|钻石|ダイヤ|ألماس/.test(s))return "diamond";if(/season|saison|temporada|赛季|シーズン|الموسم/.test(s))return "season";return "other";}
const ADAPTIVE_TEXT={
  fr:{score:n=>`Priorité ${n}/100`,reserve:n=>`Réserve conseillée : garde ${n.toLocaleString("fr-FR")} diamants pour le VIP 30 jours.`,lowBudget:"Cet achat ferait passer tes diamants sous la réserve conseillée.",unknownBudget:"Solde de diamants non lu : WarBoost ne pénalise pas le score, mais recommande de garder la réserve VIP.",vs:d=>`Contexte VS jour ${d} pris en compte.`,allStars:"Tes héros principaux visibles sont déjà à 5★ : les fragments héros génériques perdent fortement en priorité.",exFirst:t=>`Armes exclusives encore en retrait${t?` (${t})`:""} : évite de disperser les ressources rares.`,notAffordable:"Solde visible insuffisant pour cette offre.",realMoney:"Achat en argent réel : WarBoost limite volontairement la recommandation tant que le gain n'est pas ciblé.",budgetOk:"Le solde visible reste au-dessus de la réserve diamants après achat."},
  en:{score:n=>`Priority ${n}/100`,reserve:n=>`Suggested reserve: keep ${n.toLocaleString("en-GB")} diamonds for 30-day VIP.`,lowBudget:"This purchase would take your diamonds below the suggested reserve.",unknownBudget:"Diamond balance was not read: the score is not penalized, but WarBoost recommends keeping the VIP reserve.",vs:d=>`VS Day ${d} context included.`,allStars:"Your visible main heroes are already 5★, so generic hero shards lose a lot of priority.",exFirst:t=>`Exclusive weapons still lag${t?` (${t})`:""}; avoid spreading rare resources.`,notAffordable:"Visible balance is insufficient for this offer.",realMoney:"Real-money purchase: WarBoost deliberately caps the recommendation unless the gain is targeted.",budgetOk:"Visible balance remains above the diamond reserve after purchase."},
  es:{score:n=>`Prioridad ${n}/100`,reserve:n=>`Reserva recomendada: guarda ${n.toLocaleString("es-ES")} diamantes para 30 días VIP.`,lowBudget:"Esta compra dejaría tus diamantes por debajo de la reserva recomendada.",unknownBudget:"No se leyó el saldo de diamantes; WarBoost no penaliza la puntuación, pero recomienda guardar la reserva VIP.",vs:d=>`Contexto VS día ${d} incluido.`,allStars:"Tus héroes principales visibles ya están en 5★: los fragmentos genéricos pierden prioridad.",exFirst:t=>`Las armas exclusivas siguen atrasadas${t?` (${t})`:""}; evita dispersar recursos raros.`,notAffordable:"El saldo visible no alcanza para esta oferta.",realMoney:"Compra con dinero real: WarBoost limita la recomendación si la mejora no es específica.",budgetOk:"El saldo visible queda por encima de la reserva de diamantes."},
  de:{score:n=>`Priorität ${n}/100`,reserve:n=>`Empfohlene Reserve: ${n.toLocaleString("de-DE")} Diamanten für 30 Tage VIP behalten.`,lowBudget:"Dieser Kauf würde die Diamanten unter die empfohlene Reserve drücken.",unknownBudget:"Diamantenstand nicht gelesen; der Score wird nicht bestraft, aber die VIP-Reserve bleibt empfohlen.",vs:d=>`VS-Tag ${d} berücksichtigt.`,allStars:"Die sichtbaren Haupthelden sind bereits 5★; allgemeine Heldensplitter verlieren Priorität.",exFirst:t=>`Exklusivwaffen liegen noch zurück${t?` (${t})`:""}; seltene Ressourcen nicht verteilen.`,notAffordable:"Der sichtbare Bestand reicht für dieses Angebot nicht aus.",realMoney:"Echtgeldkauf: WarBoost begrenzt die Empfehlung ohne klar gezielten Fortschritt.",budgetOk:"Der sichtbare Bestand bleibt nach dem Kauf über der Diamantenreserve."},
  ja:{score:n=>`優先度 ${n}/100`,reserve:n=>`推奨予備：30日VIP用にダイヤ${n.toLocaleString("ja-JP")}を残す。`,lowBudget:"購入後のダイヤが推奨予備を下回ります。",unknownBudget:"ダイヤ残高を読み取れませんでした。スコアは減点しませんがVIP予備を推奨します。",vs:d=>`VS ${d}日目の状況を反映。`,allStars:"主力の表示英雄はすでに5★のため、汎用英雄欠片の優先度は大きく下がります。",exFirst:t=>`専用武器がまだ不足${t?` (${t})`:""}。希少素材を分散しないでください。`,notAffordable:"表示残高では購入できません。",realMoney:"課金商品は、明確なボトルネック解消でない限り評価を上限設定します。",budgetOk:"購入後もダイヤ予備を維持できます。"},
  zh:{score:n=>`优先度 ${n}/100`,reserve:n=>`建议预留：保留 ${n.toLocaleString("zh-CN")} 钻石用于30天VIP。`,lowBudget:"购买后钻石会低于建议预留。",unknownBudget:"未读取钻石余额；分数不扣减，但仍建议保留VIP预留。",vs:d=>`已纳入VS第${d}天情境。`,allStars:"可见主力英雄均已5★，通用英雄碎片优先度大幅下降。",exFirst:t=>`专属武器仍落后${t?`（${t}）`:""}；不要分散稀缺资源。`,notAffordable:"可见余额不足以购买该商品。",realMoney:"真钱购买：若不能直接解决瓶颈，WarBoost会限制推荐等级。",budgetOk:"购买后可见余额仍高于钻石预留。"},
  ar:{score:n=>`الأولوية ${n}/100`,reserve:n=>`احتياطي مقترح: احتفظ بـ ${n.toLocaleString("ar")} ألماسة لـ VIP لمدة 30 يوماً.`,lowBudget:"سيخفض هذا الشراء الألماس تحت الاحتياطي المقترح.",unknownBudget:"لم تتم قراءة رصيد الألماس؛ لا تُخفض النتيجة لكن يُنصح باحتياطي VIP.",vs:d=>`تم احتساب سياق يوم VS ${d}.`,allStars:"الأبطال الرئيسيون الظاهرون عند 5★؛ شظايا الأبطال العامة أقل أولوية.",exFirst:t=>`الأسلحة الحصرية ما زالت متأخرة${t?` (${t})`:""}؛ لا تشتت الموارد النادرة.`,notAffordable:"الرصيد الظاهر غير كافٍ لهذا العرض.",realMoney:"شراء بأموال حقيقية: يحد WarBoost التوصية ما لم يكن التقدم مستهدفاً مباشرة.",budgetOk:"يبقى الرصيد الظاهر فوق احتياطي الألماس بعد الشراء."}
};
function adaptiveText(locale){return ADAPTIVE_TEXT[localePack(locale)]||ADAPTIVE_TEXT.en;}
function isDiamondCurrency(v){return /diamond|diamant|diamante|gem|gems|钻石|ダイヤ|ألماس|💎/.test(normItem(v));}
function isCashCurrency(v){const raw=String(v||"");return /eur|usd|gbp|euro|dollar|pound/.test(normItem(v))||/[€$£]/.test(raw);}
function vsContextBoost(cat,name,day){const d=Number(day),s=normItem(name);if(!Number.isInteger(d)||d<1||d>6)return 0;
  if(d===1&&cat==="drone")return 5;
  if(d===2&&(cat==="speed_build"||(/construct|build|construction/.test(s)&&cat==="speed")))return 8;
  if(d===3&&(cat==="speed_research"||(/research|science|recherche|forsch/.test(s)&&cat==="speed")))return 8;
  if(d===3&&cat==="drone")return 3;
  if(d===4&&cat==="hero")return 7;
  if(d===5&&["speed","speed_build","speed_research","speed_train"].includes(cat))return 8;
  if(d===6&&cat==="shield")return 16;
  if(d===6&&cat==="teleport")return 12;
  if(d===6&&cat==="speed_heal")return 10;
  return 0;
}
function baseOfferScore(cat,needs){
  if(cat==="vip_time")return 94;
  if(cat==="blueprint")return 84+needs.gearUrgency*14;
  if(cat==="exclusive")return 62+needs.exclusiveUrgency*36;
  if(cat==="hero")return needs.needStars?86+needs.starsUrgency*10:44;
  if(cat==="drone")return 70+needs.droneUrgency*20-(needs.exclusiveUrgency>.85?4:0);
  if(cat==="stamina")return 84;
  if(cat==="armament")return 78;
  if(cat==="skill")return 75;
  if(cat==="campaign_chest")return 84;
  if(["speed","speed_build","speed_research","speed_train","speed_heal"].includes(cat))return 65;
  if(cat==="shield")return 58;
  if(cat==="teleport")return 56;
  if(cat==="chest")return 48;
  if(cat==="resource")return 18;
  if(cat==="cosmetic")return 16;
  return 45;
}
function scoreVisibleOffer(o,needs,state){const cat=itemCategory(o?.item_name,o?.category),store=storeKind(o?.store_type||o?.store||""),shop=state?.shop||{},a=adaptiveText(state?._locale),factors=[];let score=baseOfferScore(cat,needs);
  if(store==="honor"){if(cat==="blueprint")score=Math.max(score,99);else if(cat==="hero"&&!needs.needStars)score=Math.min(score,34);else if(cat!=="blueprint")score-=6;}
  if(store==="campaign"){if(cat==="exclusive"&&needs.needExclusive)score=Math.max(score,98);if(cat==="campaign_chest")score=Math.max(score,88);if(cat==="drone")score=Math.max(score,82);}
  if(store==="alliance"){if(cat==="hero"&&needs.needStars)score=Math.max(score,94);if(cat==="drone")score=Math.max(score,84);}
  if(store==="vip"){if(cat==="stamina")score=Math.max(score,86);if(cat==="hero"&&needs.needStars)score=Math.max(score,92);if(cat==="teleport")score=Math.max(score,63);}
  if(store==="diamond"){if(cat==="resource"||cat==="hero"||cat==="chest")score=Math.min(score,28);}
  const vsBoost=vsContextBoost(cat,o?.item_name,state?.vs?.day);if(vsBoost){score+=vsBoost;factors.push(a.vs(state.vs.day));}
  if(num(state?.season?.day)!==null){if(cat==="stamina")score+=3;if(cat==="drone")score+=2;}
  const discount=Math.max(0,Math.min(4,(num(o?.discount_pct)||0)/20));score+=discount;
  const currency=cleanName(o?.currency)||cleanName(shop?.currency),price=num(o?.price),balance=num(shop?.currency_balance),reserve=10000;
  const diamond=isDiamondCurrency(currency)||((store==="vip"||store==="diamond")&&!isCashCurrency(currency));
  if(diamond&&price!==null){
    if(balance!==null){
      if(balance<price){score=0;factors.push(a.notAffordable);}
      else if(cat!=="vip_time"&&balance-price<reserve){score-=26;factors.push(a.lowBudget);}
      else {const discretionary=Math.max(0,balance-reserve);if(cat!=="vip_time"&&discretionary>0&&price>discretionary*.25)score-=6;factors.push(a.budgetOk);}
    }else factors.push(a.unknownBudget);
  }
  if(isCashCurrency(currency)){score=Math.min(score,82);factors.push(a.realMoney);}
  if(cat==="hero"&&!needs.needStars)factors.push(a.allStars);
  if(needs.needExclusive&&["drone","stamina","speed","speed_build","speed_research","speed_train","speed_heal","hero"].includes(cat)){const t=needs.exTargets.slice(0,2).map(x=>`${x.name} EX${x.exclusive}`).join(" / ");factors.push(a.exFirst(t));}
  score=Math.max(0,Math.min(100,Math.round(score)));
  return {score,cat,factors,budget:{currency,price,balance,reserve,diamond}};
}
function verdict(score,p){return score>=85?{key:"buy_now",label:p.buy}:score>=55?{key:"consider",label:p.consider}:{key:"skip",label:p.skip};}
function offerReason(cat,needs,p){const exTarget=needs.exTargets.slice(0,2).map(x=>x.name).join(" / "),starTarget=needs.starTargets.slice(0,2).map(x=>x.name).join(" / ");if(cat==="blueprint")return p.reasonBlueprint;if(cat==="exclusive")return p.reasonExclusive(exTarget);if(cat==="hero")return p.reasonHero(starTarget);if(cat==="drone")return p.reasonDrone;if(cat==="stamina")return p.reasonStamina;if(["speed","speed_build","speed_research","speed_train","speed_heal"].includes(cat))return p.reasonSpeed;if(cat==="shield")return p.reasonShield;if(cat==="resource"||cat==="cosmetic")return p.reasonResource;return p.reasonVisible;}
function priceLabel(o,locale){const price=num(o?.price),currency=cleanName(o?.currency);if(price===null)return currency||"";return `${price.toLocaleString(String(locale||"en-GB"),{maximumFractionDigits:2})}${currency?` ${currency}`:""}`;}
function genericShopRecommendations(state,locale,needs){const p=shopText(locale),st=shopStores(locale),a=adaptiveText(locale),out=[];const add=(item,store,cat,score,reason,target="")=>{const v=verdict(score,p);out.push({item,store,score,score_label:a.score(score),reason,target,verdict:v.label,verdict_key:v.key,source:"rules"});};
  add(p.honorBp,st.honor,"blueprint",Math.round(84+needs.gearUrgency*14),p.reasonBlueprint,"Main squad gear");
  if(needs.needExclusive){const t=needs.exTargets.slice(0,3).map(x=>`${x.name} EX${x.exclusive}`).join(" → ");add(p.campaignEx,st.campaign,"exclusive",98,p.reasonExclusive(t),t);add(p.paidExclusive,st.paid,"exclusive",82,p.reasonPaid(`EX: ${t}`),t);}
  if(needs.needStars){const t=needs.starTargets.slice(0,3).map(x=>x.name).join(" / ");add(p.allianceHero,st.allianceCampaign,"hero",94,p.reasonHero(t),t);}
  const droneScore=Math.round(70+needs.droneUrgency*20-(needs.exclusiveUrgency>.85?4:0));add(p.allianceDrone,st.allianceCampaign,"drone",droneScore,p.reasonDrone,needs.droneLevel?`Drone Lv.${needs.droneLevel}`:"Drone");
  add(p.vipStamina,st.vip,"stamina",86,p.reasonStamina);add(p.speed,st.vipAlliance,"speed",65,p.reasonSpeed);add(p.shield,st.allianceDiamond,"shield",58,p.reasonShield);
  if(!needs.needExclusive&&needs.needGear)add(p.paidGear,st.paid,"blueprint",80,p.reasonPaid("gear / blueprints"),"Main squad gear");else if(!needs.needExclusive&&!needs.needStars&&!needs.needGear&&needs.droneKnown)add(p.paidDrone,st.paid,"drone",76,p.reasonPaid("Drone"),"Drone");
  add(p.resources,st.diamondPaid,"resource",18,p.reasonResource);
  return out.sort((x,y)=>y.score-x.score).slice(0,8).map((x,i)=>({...x,rank:i+1}));
}
function shopProfileConfidence(needs){const hs=Array.isArray(needs?.heroes)?needs.heroes:[];if(!hs.length)return 0;const ratio=fn=>hs.filter(fn).length/Math.max(5,hs.length);let score=0;score+=Math.min(20,hs.length/5*20);score+=ratio(h=>cleanName(h.name)&&!/^Hero\s+\d+$/i.test(h.name))*10;score+=ratio(h=>h.level!==null)*15;score+=ratio(h=>h.stars!==null)*15;score+=ratio(h=>h.exclusive!==null)*25;score+=ratio(h=>h.gear!==null)*10;if(needs.droneKnown)score+=5;return Math.max(0,Math.min(100,Math.round(score)));}
function buildShopAdvice(state,locale,analysis){const p=shopText(locale),a=adaptiveText(locale),needs=heroNeedSnapshot(state),shop=state?.shop||{},offers=Array.isArray(shop?.offers)?shop.offers:[],store=cleanName(shop?.store_type)||"Last War Shop",profileConfidence=shopProfileConfidence(needs),stateCtx={...state,_locale:locale};let recommendations=[],confidence=Math.min(90,profileConfidence);
  if(offers.length){recommendations=offers.map(o=>{const scored=scoreVisibleOffer({...o,store_type:store},needs,stateCtx),{score,cat,factors,budget}=scored,v=verdict(score,p),target=cat==="exclusive"?needs.exTargets.slice(0,3).map(x=>`${x.name} EX${x.exclusive}`).join(" / "):cat==="hero"?needs.starTargets.slice(0,3).map(x=>x.name).join(" / "):cat==="drone"?(needs.droneLevel?`Drone Lv.${needs.droneLevel}`:"Drone"):"";const reason=[offerReason(cat,needs,p),...factors].filter(Boolean).join(" ");return {item:cleanName(o?.item_name)||"—",store,score,score_label:a.score(score),reason,target,verdict:v.label,verdict_key:v.key,price_label:priceLabel(o,locale),source:"scan",category:cat,budget};}).sort((x,y)=>y.score-x.score).slice(0,10).map((x,i)=>({...x,rank:i+1}));const quality=(cleanName(shop?.store_type)?10:0)+Math.min(18,offers.length*2)+(num(shop?.currency_balance)!==null?6:0);confidence=Math.min(98,Math.max(confidence,Math.round(profileConfidence*.68+(68+quality)*.32)));if((storeKind(store)==="vip"||storeKind(store)==="diamond")&&num(shop?.currency_balance)===null)confidence=Math.max(0,confidence-4);}
  else recommendations=genericShopRecommendations(state,locale,needs);
  const balance=num(shop?.currency_balance),currency=cleanName(shop?.currency),budgetSummary=(balance!==null&&isDiamondCurrency(currency||store))?` ${a.reserve(10000)}`:"";
  const summary=(offers.length?p.scanSummary(store,offers.length):p.rulesSummary)+budgetSummary;
  return {summary,confidence,confidence_label:`${T[localePack(locale)]?.confidence?T[localePack(locale)].confidence(confidence):`Confidence ${confidence}%`}`,scan_based:offers.length>0,store_type:store,updated_at:shop?.updated_at||null,recommendations,knowledge_date:"2026-08-21",method:"adaptive-account-rules + visible-shop-scan + diamond-reserve + VS/season-context",budget:{currency:currency||null,balance,reserve_diamonds:10000},needs:{exclusive_urgency:Math.round(needs.exclusiveUrgency*100),stars_urgency:Math.round(needs.starsUrgency*100),gear_urgency:Math.round(needs.gearUrgency*100),drone_urgency:Math.round(needs.droneUrgency*100)},sources:["Last War Vault Honor Shop Guide (2026-04-26)","Last War Vault VS Guide (2026)","LastWarSurvival.com Stores / Gear Guide (2026)","Last War community VIP diamond-spend consensus (2026-07)"]};
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
    analysis.shop=buildShopAdvice(s,loc,analysis);
    analysis.engine="warboost-pro-shop-v1.3.3";
    return res.status(200).json({ok:true,engine:analysis.engine,advice:analysis.summary,analysis});
  }
  const p=basicPack(loc);let advice;
  if(scope==="alliance")advice=p.alliance((s.alliance?.members||[]).length);else if(scope==="vs")advice=p.vs(s.vs||{});else advice=p.season(s.season||{});
  return res.status(200).json({ok:true,engine:"warboost-rules-v1.3.3",advice});
}
