const HOURS=60*60*1000;
const LIMITS={
  player:{fresh:48,stale:168},
  drone:{fresh:48,stale:168},
  shop:{fresh:12,stale:36},
  vs:{fresh:12,stale:24},
  season:{fresh:24,stale:72}
};
const TEXT={
  fr:{now:"Données mises à jour à l'instant",fresh:h=>`Données récentes · ${h} h`,aging:h=>`Données à surveiller · ${h} h`,stale:d=>`Données à actualiser · ${d} j`,unknown:"Date des données inconnue · actualise avant un achat",refreshPaid:"Actualise d’abord les données du compte avant tout achat payant."},
  en:{now:"Data updated just now",fresh:h=>`Fresh data · ${h}h`,aging:h=>`Data aging · ${h}h`,stale:d=>`Refresh data · ${d}d old`,unknown:"Data timestamp unknown · refresh before buying",refreshPaid:"Refresh the account data before any paid purchase."},
  es:{now:"Datos actualizados ahora mismo",fresh:h=>`Datos recientes · ${h} h`,aging:h=>`Datos envejeciendo · ${h} h`,stale:d=>`Datos por actualizar · ${d} d`,unknown:"Fecha de datos desconocida · actualiza antes de comprar",refreshPaid:"Actualiza primero los datos de la cuenta antes de cualquier compra de pago."},
  de:{now:"Daten gerade aktualisiert",fresh:h=>`Aktuelle Daten · ${h} Std.`,aging:h=>`Daten werden älter · ${h} Std.`,stale:d=>`Daten aktualisieren · ${d} T.`,unknown:"Datenzeitpunkt unbekannt · vor Kauf aktualisieren",refreshPaid:"Kontodaten vor einem Echtgeldkauf zuerst aktualisieren."},
  it:{now:"Dati aggiornati ora",fresh:h=>`Dati recenti · ${h} h`,aging:h=>`Dati da monitorare · ${h} h`,stale:d=>`Dati da aggiornare · ${d} g`,unknown:"Data dei dati sconosciuta · aggiorna prima di acquistare",refreshPaid:"Aggiorna prima i dati dell'account prima di un acquisto a pagamento."},
  pt:{now:"Dados atualizados agora",fresh:h=>`Dados recentes · ${h} h`,aging:h=>`Dados a envelhecer · ${h} h`,stale:d=>`Atualizar dados · ${d} d`,unknown:"Data dos dados desconhecida · atualiza antes de comprar",refreshPaid:"Atualiza primeiro os dados da conta antes de qualquer compra paga."},
  nl:{now:"Gegevens zojuist bijgewerkt",fresh:h=>`Recente gegevens · ${h} u`,aging:h=>`Gegevens verouderen · ${h} u`,stale:d=>`Gegevens vernieuwen · ${d} d`,unknown:"Tijdstip van gegevens onbekend · vernieuw vóór aankoop",refreshPaid:"Vernieuw eerst de accountgegevens vóór een betaalde aankoop."},
  zh:{now:"数据刚刚更新",fresh:h=>`数据较新 · ${h}小时`,aging:h=>`数据正在变旧 · ${h}小时`,stale:d=>`需要更新数据 · ${d}天`,unknown:"数据时间未知 · 购买前请更新",refreshPaid:"任何付费购买前先更新账号数据。"},
  ja:{now:"データをたった今更新",fresh:h=>`最新データ · ${h}時間`,aging:h=>`データ経過 · ${h}時間`,stale:d=>`データ更新が必要 · ${d}日`,unknown:"データ日時不明 · 購入前に更新",refreshPaid:"課金購入の前にアカウントデータを更新してください。"},
  ru:{now:"Данные только что обновлены",fresh:h=>`Свежие данные · ${h} ч`,aging:h=>`Данные устаревают · ${h} ч`,stale:d=>`Обновите данные · ${d} д`,unknown:"Время данных неизвестно · обновите перед покупкой",refreshPaid:"Сначала обновите данные аккаунта перед платной покупкой."},
  ar:{now:"تم تحديث البيانات الآن",fresh:h=>`بيانات حديثة · ${h} س`,aging:h=>`البيانات أصبحت أقدم · ${h} س`,stale:d=>`حدّث البيانات · منذ ${d} ي`,unknown:"وقت البيانات غير معروف · حدّث قبل الشراء",refreshPaid:"حدّث بيانات الحساب قبل أي شراء مدفوع."},
  pl:{now:"Dane zaktualizowane przed chwilą",fresh:h=>`Świeże dane · ${h} godz.`,aging:h=>`Dane się starzeją · ${h} godz.`,stale:d=>`Odśwież dane · ${d} d`,unknown:"Nieznany czas danych · odśwież przed zakupem",refreshPaid:"Najpierw odśwież dane konta przed płatnym zakupem."},
  tr:{now:"Veriler şimdi güncellendi",fresh:h=>`Güncel veriler · ${h} sa`,aging:h=>`Veriler eskiyor · ${h} sa`,stale:d=>`Verileri yenile · ${d} g`,unknown:"Veri zamanı bilinmiyor · satın almadan önce yenile",refreshPaid:"Ücretli satın almadan önce hesap verilerini yenile."},
  ko:{now:"데이터가 방금 업데이트됨",fresh:h=>`최신 데이터 · ${h}시간`,aging:h=>`데이터가 오래됨 · ${h}시간`,stale:d=>`데이터 새로고침 · ${d}일`,unknown:"데이터 시간이 확인되지 않음 · 구매 전 새로고침",refreshPaid:"유료 구매 전에 계정 데이터를 먼저 새로고침하세요."},
  vi:{now:"Dữ liệu vừa được cập nhật",fresh:h=>`Dữ liệu mới · ${h} giờ`,aging:h=>`Dữ liệu đang cũ dần · ${h} giờ`,stale:d=>`Làm mới dữ liệu · ${d} ngày`,unknown:"Không rõ thời gian dữ liệu · hãy làm mới trước khi mua",refreshPaid:"Hãy làm mới dữ liệu tài khoản trước mọi giao dịch trả phí."},
  th:{now:"อัปเดตข้อมูลเมื่อสักครู่",fresh:h=>`ข้อมูลล่าสุด · ${h} ชม.`,aging:h=>`ข้อมูลเริ่มเก่า · ${h} ชม.`,stale:d=>`รีเฟรชข้อมูล · ${d} วัน`,unknown:"ไม่ทราบเวลาของข้อมูล · รีเฟรชก่อนซื้อ",refreshPaid:"รีเฟรชข้อมูลบัญชีก่อนการซื้อแบบชำระเงิน"},
  id:{now:"Data baru saja diperbarui",fresh:h=>`Data terbaru · ${h} jam`,aging:h=>`Data mulai lama · ${h} jam`,stale:d=>`Perbarui data · ${d} hari`,unknown:"Waktu data tidak diketahui · perbarui sebelum membeli",refreshPaid:"Perbarui data akun sebelum pembelian berbayar."},
  uk:{now:"Дані щойно оновлено",fresh:h=>`Свіжі дані · ${h} год`,aging:h=>`Дані старішають · ${h} год`,stale:d=>`Оновіть дані · ${d} д`,unknown:"Час даних невідомий · оновіть перед покупкою",refreshPaid:"Спочатку оновіть дані акаунта перед платною покупкою."},
  ro:{now:"Date actualizate chiar acum",fresh:h=>`Date recente · ${h} h`,aging:h=>`Date în curs de învechire · ${h} h`,stale:d=>`Actualizează datele · ${d} z`,unknown:"Data informațiilor este necunoscută · actualizează înainte de cumpărare",refreshPaid:"Actualizează mai întâi datele contului înainte de orice achiziție plătită."},
  el:{now:"Τα δεδομένα ενημερώθηκαν μόλις τώρα",fresh:h=>`Πρόσφατα δεδομένα · ${h} ω`,aging:h=>`Τα δεδομένα παλιώνουν · ${h} ω`,stale:d=>`Ανανέωση δεδομένων · ${d} ημ`,unknown:"Άγνωστη χρονική σήμανση · ανανέωσε πριν από αγορά",refreshPaid:"Ανανέωσε πρώτα τα δεδομένα λογαριασμού πριν από πληρωμένη αγορά."},
  cs:{now:"Data právě aktualizována",fresh:h=>`Čerstvá data · ${h} h`,aging:h=>`Data stárnou · ${h} h`,stale:d=>`Obnov data · ${d} d`,unknown:"Čas dat není znám · před nákupem obnov",refreshPaid:"Před placeným nákupem nejdřív obnov data účtu."},
  sv:{now:"Data uppdaterades nyss",fresh:h=>`Färska data · ${h} tim`,aging:h=>`Data börjar bli gamla · ${h} tim`,stale:d=>`Uppdatera data · ${d} d`,unknown:"Okänd datatid · uppdatera före köp",refreshPaid:"Uppdatera kontodata före ett betalt köp."}
};
function localeKey(locale){
  const x=String(locale||"en").toLowerCase();
  for(const k of ["fr","es","de","it","pt","nl","zh","ja","ru","ar","pl","tr","ko","vi","th","id","uk","ro","el","cs","sv"])if(x.startsWith(k))return k;
  return "en";
}
function domainKey(domain){return LIMITS[domain]?domain:"player"}
export function freshnessInfo(timestamp,domain="player",locale="en"){
  const key=domainKey(domain),limits=LIMITS[key],text=TEXT[localeKey(locale)]||TEXT.en;
  const ms=Date.parse(timestamp||"");
  if(!Number.isFinite(ms))return {status:"unknown",domain:key,age_hours:null,age_days:null,label:text.unknown,blocks_paid:true,confidence_penalty:12};
  const age=Math.max(0,(Date.now()-ms)/HOURS),hours=Math.round(age),days=Math.max(1,Math.round(age/24));
  if(age<1)return {status:"fresh",domain:key,age_hours:hours,age_days:0,label:text.now,blocks_paid:false,confidence_penalty:0};
  if(age<=limits.fresh)return {status:"fresh",domain:key,age_hours:hours,age_days:Math.round(age/24),label:text.fresh(hours),blocks_paid:false,confidence_penalty:0};
  if(age<=limits.stale)return {status:"aging",domain:key,age_hours:hours,age_days:days,label:text.aging(hours),blocks_paid:false,confidence_penalty:5};
  return {status:"stale",domain:key,age_hours:hours,age_days:days,label:text.stale(days),blocks_paid:true,confidence_penalty:16};
}
export function refreshBeforePaidText(locale="en"){return (TEXT[localeKey(locale)]||TEXT.en).refreshPaid}
export function freshnessThresholds(){return JSON.parse(JSON.stringify(LIMITS))}
