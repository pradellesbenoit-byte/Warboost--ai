const rows={
  fr:["Type / format observé","pièce {piece}","Pièces lisibles uniquement ; équipement incomplet, sans confirmation globale."],
  en:["Observed type / format","piece {piece}","Readable pieces only; incomplete equipment, no overall confirmation."],
  de:["Erkannter Typ / Format","Teil {piece}","Nur lesbare Teile; unvollständige Ausrüstung, keine Gesamtbestätigung."],
  es:["Tipo / formato observado","pieza {piece}","Solo piezas legibles; equipo incompleto, sin confirmación global."],
  it:["Tipo / formato osservato","pezzo {piece}","Solo pezzi leggibili; equipaggiamento incompleto, nessuna conferma globale."],
  pt:["Tipo / formato observado","peça {piece}","Apenas peças legíveis; equipamento incompleto, sem confirmação global."],
  ru:["Обнаруженный тип / формат","предмет {piece}","Только читаемые предметы; снаряжение неполное, общего подтверждения нет."],
  uk:["Виявлений тип / формат","предмет {piece}","Лише читабельні предмети; спорядження неповне, загального підтвердження немає."],
  pl:["Wykryty typ / format","element {piece}","Tylko czytelne elementy; niepełne wyposażenie, brak pełnego potwierdzenia."],
  tr:["Gözlenen tür / biçim","parça {piece}","Yalnızca okunabilen parçalar; eksik ekipman, genel onay yok."],
  ar:["النوع / التنسيق المرصود","القطعة {piece}","القطع المقروءة فقط؛ المعدات غير مكتملة ولا يوجد تأكيد شامل."],
  ja:["確認された型 / 形式","装備 {piece}","読み取れる装備のみ。装備は不完全で、全体の確認はありません。"],
  ko:["확인된 유형 / 형식","장비 {piece}","읽을 수 있는 장비만 비교합니다. 불완전한 장비이며 전체 확인이 아닙니다."],
  zh:["检测到的类型 / 格式","装备 {piece}","仅比较可读装备；装备不完整，不代表全部已确认。"],
  id:["Jenis / format teramati","bagian {piece}","Hanya bagian terbaca; perlengkapan belum lengkap, tanpa konfirmasi keseluruhan."],
  vi:["Kiểu / định dạng ghi nhận","món {piece}","Chỉ các món đọc được; trang bị chưa đủ, không xác nhận toàn bộ."],
  th:["ชนิด / รูปแบบที่พบ","ชิ้นที่ {piece}","เฉพาะชิ้นที่อ่านได้ อุปกรณ์ยังไม่ครบและยังไม่ยืนยันทั้งหมด"],
  hi:["देखा गया प्रकार / प्रारूप","उपकरण {piece}","केवल पढ़ने योग्य उपकरण; अधूरे उपकरण, समग्र पुष्टि नहीं।"],
  ro:["Tip / format observat","piesă {piece}","Doar piesele lizibile; echipament incomplet, fără confirmare integrală."],
  cs:["Zjištěný typ / formát","kus {piece}","Pouze čitelné kusy; neúplné vybavení, bez celkového potvrzení."],
  nl:["Waargenomen type / formaat","onderdeel {piece}","Alleen leesbare onderdelen; onvolledige uitrusting, geen volledige bevestiging."],
  sv:["Observerad typ / format","del {piece}","Endast läsbara delar; ofullständig utrustning, ingen fullständig bekräftelse."]
};
export function squadComparisonGearCopy(code){
  const row=rows[code]||rows.en;
  return Object.fromEntries(["format","piece","partial"].map((key,index)=>["squad_compare_gear_"+key,row[index]]));
}
