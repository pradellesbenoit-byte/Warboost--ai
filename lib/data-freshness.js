const HOURS=60*60*1000;
const LIMITS={
  player:{fresh:48,stale:168},
  drone:{fresh:48,stale:168},
  shop:{fresh:12,stale:36},
  vs:{fresh:12,stale:24},
  season:{fresh:24,stale:72}
};
const TEXT={
  fr:{fresh:h=>`Données récentes · ${h} h`,aging:h=>`Données à surveiller · ${h} h`,stale:d=>`Données à actualiser · ${d} j`,unknown:"Date des données inconnue · actualise avant un achat",refreshPaid:"Actualise d’abord les données du compte avant tout achat payant."},
  en:{fresh:h=>`Fresh data · ${h}h`,aging:h=>`Data aging · ${h}h`,stale:d=>`Refresh data · ${d}d old`,unknown:"Data timestamp unknown · refresh before buying",refreshPaid:"Refresh the account data before any paid purchase."},
  es:{fresh:h=>`Datos recientes · ${h} h`,aging:h=>`Datos envejeciendo · ${h} h`,stale:d=>`Datos por actualizar · ${d} d`,unknown:"Fecha de datos desconocida · actualiza antes de comprar",refreshPaid:"Actualiza primero los datos de la cuenta antes de cualquier compra de pago."},
  de:{fresh:h=>`Aktuelle Daten · ${h} Std.`,aging:h=>`Daten werden älter · ${h} Std.`,stale:d=>`Daten aktualisieren · ${d} T.`,unknown:"Datenzeitpunkt unbekannt · vor Kauf aktualisieren",refreshPaid:"Kontodaten vor einem Echtgeldkauf zuerst aktualisieren."},
  ja:{fresh:h=>`最新データ · ${h}時間`,aging:h=>`データ経過 · ${h}時間`,stale:d=>`データ更新が必要 · ${d}日`,unknown:"データ日時不明 · 購入前に更新",refreshPaid:"課金購入の前にアカウントデータを更新してください。"},
  zh:{fresh:h=>`数据较新 · ${h}小时`,aging:h=>`数据正在变旧 · ${h}小时`,stale:d=>`需要更新数据 · ${d}天`,unknown:"数据时间未知 · 购买前请更新",refreshPaid:"任何付费购买前先更新账号数据。"},
  ar:{fresh:h=>`بيانات حديثة · ${h} س`,aging:h=>`البيانات أصبحت أقدم · ${h} س`,stale:d=>`حدّث البيانات · منذ ${d} ي`,unknown:"وقت البيانات غير معروف · حدّث قبل الشراء",refreshPaid:"حدّث بيانات الحساب قبل أي شراء مدفوع."}
};
function localeKey(locale){const x=String(locale||"en").toLowerCase();if(x.startsWith("fr"))return"fr";if(x.startsWith("es"))return"es";if(x.startsWith("de"))return"de";if(x.startsWith("ja"))return"ja";if(x.startsWith("zh"))return"zh";if(x.startsWith("ar"))return"ar";return"en"}
function domainKey(domain){return LIMITS[domain]?domain:"player"}
export function freshnessInfo(timestamp,domain="player",locale="en"){
  const key=domainKey(domain),limits=LIMITS[key],text=TEXT[localeKey(locale)]||TEXT.en;
  const ms=Date.parse(timestamp||"");
  if(!Number.isFinite(ms))return {status:"unknown",domain:key,age_hours:null,age_days:null,label:text.unknown,blocks_paid:true,confidence_penalty:12};
  const age=Math.max(0,(Date.now()-ms)/HOURS),hours=Math.round(age),days=Math.max(1,Math.round(age/24));
  if(age<=limits.fresh)return {status:"fresh",domain:key,age_hours:hours,age_days:Math.round(age/24),label:text.fresh(hours),blocks_paid:false,confidence_penalty:0};
  if(age<=limits.stale)return {status:"aging",domain:key,age_hours:hours,age_days:days,label:text.aging(hours),blocks_paid:false,confidence_penalty:5};
  return {status:"stale",domain:key,age_hours:hours,age_days:days,label:text.stale(days),blocks_paid:true,confidence_penalty:16};
}
export function refreshBeforePaidText(locale="en"){return (TEXT[localeKey(locale)]||TEXT.en).refreshPaid}
export function freshnessThresholds(){return JSON.parse(JSON.stringify(LIMITS))}
