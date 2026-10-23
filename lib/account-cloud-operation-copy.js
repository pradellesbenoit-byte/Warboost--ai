// Each language has explicit copy. A read check never claims a successful save.
const rows={
fr:"Dernière vérification cloud|Vérification réussie — aucune sauvegarde effectuée.|Dernière tentative de sauvegarde / état local|Historique de synchronisation : {date} (pas une preuve de sauvegarde actuelle).|Sauvegarde confirmée pour la version actuelle : {date}.",
en:"Last cloud check|Check successful — no save performed.|Last save attempt / local status|Synchronization history: {date} (not proof of a current save).|Save confirmed for the current version: {date}.",
de:"Letzte Cloud-Prüfung|Prüfung erfolgreich — nichts gespeichert.|Letzter Speicherversuch / lokaler Status|Synchronisierungsverlauf: {date} (kein Nachweis einer aktuellen Speicherung).|Speicherung der aktuellen Version bestätigt: {date}.",
es:"Última comprobación de la nube|Comprobación correcta — no se guardó nada.|Último intento de guardado / estado local|Historial de sincronización: {date} (no prueba un guardado actual).|Guardado de la versión actual confirmado: {date}.",
it:"Ultima verifica cloud|Verifica riuscita — nessun salvataggio effettuato.|Ultimo tentativo di salvataggio / stato locale|Cronologia sincronizzazione: {date} (non prova un salvataggio attuale).|Salvataggio della versione attuale confermato: {date}.",
pt:"Última verificação da nuvem|Verificação concluída — nada foi guardado.|Última tentativa de guardar / estado local|Histórico de sincronização: {date} (não prova uma gravação atual).|Gravação da versão atual confirmada: {date}.",
pl:"Ostatnia kontrola chmury|Kontrola udana — nic nie zapisano.|Ostatnia próba zapisu / stan lokalny|Historia synchronizacji: {date} (nie potwierdza bieżącego zapisu).|Zapis bieżącej wersji potwierdzony: {date}.",
tr:"Son bulut kontrolü|Kontrol başarılı — kayıt yapılmadı.|Son kayıt denemesi / yerel durum|Eşitleme geçmişi: {date} (güncel kaydın kanıtı değildir).|Güncel sürümün kaydı doğrulandı: {date}.",
ru:"Последняя проверка облака|Проверка успешна — сохранение не выполнялось.|Последняя попытка сохранения / локальное состояние|История синхронизации: {date} (не доказательство текущего сохранения).|Сохранение текущей версии подтверждено: {date}.",
uk:"Остання перевірка хмари|Перевірка успішна — збереження не виконувалося.|Остання спроба збереження / локальний стан|Історія синхронізації: {date} (не доказ поточного збереження).|Збереження поточної версії підтверджено: {date}.",
ar:"آخر تحقق من السحابة|نجح التحقق — لم يتم إجراء أي حفظ.|آخر محاولة حفظ / الحالة المحلية|سجل المزامنة: {date} (ليس دليلاً على حفظ حالي).|تم تأكيد حفظ الإصدار الحالي: {date}.",
ja:"最後のクラウド確認|確認成功 — 保存は行われていません。|最後の保存試行 / ローカル状態|同期履歴：{date}（現在の保存の証明ではありません）。|現在のバージョンの保存確認：{date}。",
ko:"마지막 클라우드 확인|확인 성공 — 저장하지 않았습니다.|마지막 저장 시도 / 로컬 상태|동기화 기록: {date} (현재 저장의 증거가 아닙니다).|현재 버전 저장 확인: {date}.",
zh:"上次云端检查|检查成功 — 未执行保存。|上次保存尝试 / 本地状态|同步历史：{date}（并非当前保存的证明）。|已确认保存当前版本：{date}。",
ro:"Ultima verificare cloud|Verificare reușită — nu s-a salvat nimic.|Ultima încercare de salvare / stare locală|Istoric sincronizare: {date} (nu dovedește o salvare actuală).|Salvarea versiunii actuale confirmată: {date}.",
el:"Τελευταίος έλεγχος cloud|Επιτυχής έλεγχος — δεν έγινε αποθήκευση.|Τελευταία προσπάθεια αποθήκευσης / τοπική κατάσταση|Ιστορικό συγχρονισμού: {date} (δεν αποδεικνύει τρέχουσα αποθήκευση).|Επιβεβαιώθηκε αποθήκευση τρέχουσας έκδοσης: {date}.",
cs:"Poslední kontrola cloudu|Kontrola úspěšná — nic nebylo uloženo.|Poslední pokus o uložení / místní stav|Historie synchronizace: {date} (není důkazem aktuálního uložení).|Uložení aktuální verze potvrzeno: {date}.",
id:"Pemeriksaan cloud terakhir|Pemeriksaan berhasil — tidak ada penyimpanan.|Percobaan penyimpanan terakhir / status lokal|Riwayat sinkronisasi: {date} (bukan bukti penyimpanan saat ini).|Penyimpanan versi saat ini dikonfirmasi: {date}.",
th:"การตรวจสอบคลาวด์ล่าสุด|ตรวจสอบสำเร็จ — ไม่มีการบันทึก|ความพยายามบันทึกล่าสุด / สถานะในเครื่อง|ประวัติการซิงค์: {date} (ไม่ใช่หลักฐานการบันทึกปัจจุบัน)|ยืนยันการบันทึกเวอร์ชันปัจจุบัน: {date}",
vi:"Lần kiểm tra đám mây gần nhất|Kiểm tra thành công — không thực hiện lưu.|Lần thử lưu gần nhất / trạng thái cục bộ|Lịch sử đồng bộ: {date} (không chứng minh lần lưu hiện tại).|Đã xác nhận lưu phiên bản hiện tại: {date}.",
nl:"Laatste cloudcontrole|Controle geslaagd — niets opgeslagen.|Laatste opslagpoging / lokale status|Synchronisatiegeschiedenis: {date} (geen bewijs van huidige opslag).|Opslag van huidige versie bevestigd: {date}.",
sv:"Senaste molnkontroll|Kontroll lyckades — inget sparades.|Senaste sparförsök / lokal status|Synkroniseringshistorik: {date} (inte bevis på aktuell sparning).|Sparning av aktuell version bekräftad: {date}."
};
const keys=["check_label","check_ok","save_label","history","write_confirmed"];
export function cloudOperationCopy(code){
  const values=rows[code]?.split("|");
  if(!values||values.length!==keys.length)throw Error("cloud_operation_copy_incomplete");
  return Object.fromEntries(keys.map((key,i)=>["account_sync_"+key,values[i]]));
}
