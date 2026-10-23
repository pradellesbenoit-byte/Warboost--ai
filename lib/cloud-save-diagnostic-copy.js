const rows={
fr:"La base a refusé cette opération. Consulte le diagnostic ; aucun changement de droits automatique.|Le schéma cloud requis pour cette opération est à vérifier. Consulte le diagnostic.|La base a refusé les données ou rencontré une erreur SQL. Consulte le diagnostic.|Diagnostic de sauvegarde — code de support",
en:"The database refused this operation. See diagnostics; permissions are not changed automatically.|The cloud schema required for this operation needs checking. See diagnostics.|The database rejected the data or encountered an SQL error. See diagnostics.|Save diagnostic — support code",
de:"Die Datenbank hat diesen Vorgang abgelehnt. Siehe Diagnose; Rechte werden nicht automatisch geändert.|Das für diesen Vorgang benötigte Cloud-Schema muss geprüft werden. Siehe Diagnose.|Die Datenbank hat Daten abgelehnt oder einen SQL-Fehler festgestellt. Siehe Diagnose.|Speicherdiagnose — Supportcode",
es:"La base de datos rechazó esta operación. Consulta el diagnóstico; no se cambian permisos automáticamente.|Debe revisarse el esquema de nube necesario. Consulta el diagnóstico.|La base rechazó los datos o encontró un error SQL. Consulta el diagnóstico.|Diagnóstico de guardado — código de soporte",
it:"Il database ha rifiutato l’operazione. Consulta la diagnostica; i permessi non cambiano automaticamente.|Lo schema cloud richiesto va verificato. Consulta la diagnostica.|Il database ha rifiutato i dati o rilevato un errore SQL. Consulta la diagnostica.|Diagnostica salvataggio — codice assistenza",
pt:"A base recusou esta operação. Consulta o diagnóstico; não se alteram permissões automaticamente.|O esquema cloud necessário deve ser verificado. Consulta o diagnóstico.|A base recusou os dados ou encontrou um erro SQL. Consulta o diagnóstico.|Diagnóstico de gravação — código de suporte",
pl:"Baza odrzuciła operację. Sprawdź diagnostykę; uprawnienia nie zmieniają się automatycznie.|Wymagany schemat chmury wymaga sprawdzenia. Zobacz diagnostykę.|Baza odrzuciła dane lub napotkała błąd SQL. Zobacz diagnostykę.|Diagnostyka zapisu — kod pomocy",
tr:"Veritabanı işlemi reddetti. Tanılamaya bak; izinler otomatik değiştirilmez.|Gerekli bulut şeması kontrol edilmeli. Tanılamaya bak.|Veritabanı veriyi reddetti veya SQL hatası oluştu. Tanılamaya bak.|Kayıt tanılaması — destek kodu",
ru:"База отклонила операцию. См. диагностику; права автоматически не меняются.|Нужна проверка схемы облака. См. диагностику.|База отклонила данные или возникла ошибка SQL. См. диагностику.|Диагностика сохранения — код поддержки",
uk:"База відхилила операцію. Див. діагностику; права автоматично не змінюються.|Потрібна перевірка схеми хмари. Див. діагностику.|База відхилила дані або сталася помилка SQL. Див. діагностику.|Діагностика збереження — код підтримки",
ar:"رفضت قاعدة البيانات العملية. راجع التشخيص؛ لا تتغير الصلاحيات تلقائياً.|يجب التحقق من مخطط السحابة المطلوب. راجع التشخيص.|رفضت القاعدة البيانات أو حدث خطأ SQL. راجع التشخيص.|تشخيص الحفظ — رمز الدعم",
ja:"データベースが操作を拒否しました。診断を確認してください。権限は自動変更されません。|必要なクラウドスキーマの確認が必要です。診断を確認してください。|データベースがデータを拒否したかSQLエラーが発生しました。診断を確認してください。|保存診断 — サポートコード",
ko:"데이터베이스가 작업을 거부했습니다. 진단을 확인하세요. 권한은 자동 변경되지 않습니다.|필요한 클라우드 스키마를 확인해야 합니다. 진단을 확인하세요.|데이터베이스가 데이터를 거부했거나 SQL 오류가 발생했습니다. 진단을 확인하세요.|저장 진단 — 지원 코드",
zh:"数据库拒绝了操作。请查看诊断；不会自动更改权限。|需要检查此操作所需的云端结构。请查看诊断。|数据库拒绝了数据或发生SQL错误。请查看诊断。|保存诊断 — 支持代码",
ro:"Baza a refuzat operația. Vezi diagnosticul; permisiunile nu se schimbă automat.|Schema cloud necesară trebuie verificată. Vezi diagnosticul.|Baza a respins datele sau a întâmpinat o eroare SQL. Vezi diagnosticul.|Diagnostic salvare — cod suport",
el:"Η βάση απέρριψε την ενέργεια. Δες τη διάγνωση· τα δικαιώματα δεν αλλάζουν αυτόματα.|Το απαιτούμενο σχήμα cloud χρειάζεται έλεγχο. Δες τη διάγνωση.|Η βάση απέρριψε τα δεδομένα ή προέκυψε σφάλμα SQL. Δες τη διάγνωση.|Διάγνωση αποθήκευσης — κωδικός υποστήριξης",
cs:"Databáze odmítla operaci. Viz diagnostika; oprávnění se automaticky nemění.|Je třeba ověřit požadované schéma cloudu. Viz diagnostika.|Databáze odmítla data nebo došlo k chybě SQL. Viz diagnostika.|Diagnostika ukládání — kód podpory",
id:"Database menolak operasi. Lihat diagnostik; izin tidak diubah otomatis.|Skema cloud yang diperlukan perlu diperiksa. Lihat diagnostik.|Database menolak data atau mengalami kesalahan SQL. Lihat diagnostik.|Diagnostik penyimpanan — kode dukungan",
th:"ฐานข้อมูลปฏิเสธการทำงาน ดูการวินิจฉัย ไม่มีการเปลี่ยนสิทธิ์อัตโนมัติ|ต้องตรวจสอบโครงสร้างคลาวด์ที่จำเป็น ดูการวินิจฉัย|ฐานข้อมูลปฏิเสธข้อมูลหรือพบข้อผิดพลาด SQL ดูการวินิจฉัย|การวินิจฉัยการบันทึก — รหัสช่วยเหลือ",
vi:"Cơ sở dữ liệu từ chối thao tác. Xem chẩn đoán; không tự đổi quyền.|Cần kiểm tra cấu trúc đám mây cần thiết. Xem chẩn đoán.|Cơ sở dữ liệu từ chối dữ liệu hoặc gặp lỗi SQL. Xem chẩn đoán.|Chẩn đoán lưu — mã hỗ trợ",
nl:"De database weigerde de bewerking. Zie diagnose; rechten veranderen niet automatisch.|Het benodigde cloudschema moet worden gecontroleerd. Zie diagnose.|De database weigerde gegevens of gaf een SQL-fout. Zie diagnose.|Opslagdiagnose — ondersteuningscode",
sv:"Databasen nekade åtgärden. Se diagnostik; behörigheter ändras inte automatiskt.|Det nödvändiga molnschemat behöver kontrolleras. Se diagnostik.|Databasen avvisade data eller ett SQL-fel uppstod. Se diagnostik.|Spardiagnostik — supportkod"
};
export function cloudSaveDiagnosticCopy(code){
  const values=rows[code]?.split("|");
  if(values?.length!==4)throw Error("cloud_save_diagnostic_copy_incomplete");
  return Object.fromEntries(["database_permissions","database_schema","database_sql","diagnostic"].map((key,i)=>["account_sync_"+key,values[i]]));
}
