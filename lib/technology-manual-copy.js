// Each supported locale supplies controls and the entire canonical catalogue.
const controls={
 fr:"Technologie|Non renseigné|Pourcentage|Niveau Max|Verrouillée|Condition / prérequis (facultatif)|Enregistrer|Annuler|Sauvegardé localement|Sauvegarde cloud confirmée|Cloud non confirmé — copie locale conservée|Saisis un pourcentage entre 0 et 100.|Donnée modifiée ailleurs ou compte changé : annule puis réessaie.|Échec de sauvegarde locale : saisie conservée.",
 en:"Technology|Not provided|Percentage|Max Level|Locked|Condition / prerequisite (optional)|Save|Cancel|Saved locally|Cloud save confirmed|Cloud unconfirmed — local copy retained|Enter a percentage from 0 to 100.|Data changed elsewhere or account changed: cancel and retry.|Local save failed: input retained.",
 es:"Tecnología|Sin datos|Porcentaje|Nivel máximo|Bloqueada|Condición / requisito (opcional)|Guardar|Cancelar|Guardado localmente|Guardado en la nube confirmado|Nube sin confirmar — copia local conservada|Introduce un porcentaje entre 0 y 100.|Datos o cuenta cambiados: cancela y vuelve a intentarlo.|Error de guardado local: entrada conservada.",
 it:"Tecnologia|Non indicato|Percentuale|Livello massimo|Bloccata|Condizione / requisito (facoltativo)|Salva|Annulla|Salvato localmente|Salvataggio cloud confermato|Cloud non confermato — copia locale conservata|Inserisci una percentuale tra 0 e 100.|Dati o account cambiati: annulla e riprova.|Salvataggio locale fallito: dati inseriti conservati.",
 de:"Technologie|Nicht angegeben|Prozentwert|Maximale Stufe|Gesperrt|Bedingung / Voraussetzung (optional)|Speichern|Abbrechen|Lokal gespeichert|Cloud-Speicherung bestätigt|Cloud unbestätigt — lokale Kopie behalten|Prozentwert von 0 bis 100 eingeben.|Daten oder Konto geändert: abbrechen und erneut versuchen.|Lokales Speichern fehlgeschlagen: Eingabe behalten.",
 pt:"Tecnologia|Não informado|Percentagem|Nível máximo|Bloqueada|Condição / requisito (opcional)|Guardar|Cancelar|Guardado localmente|Gravação na nuvem confirmada|Nuvem não confirmada — cópia local mantida|Introduz uma percentagem entre 0 e 100.|Dados ou conta alterados: cancela e tenta novamente.|Falha ao guardar localmente: dados mantidos.",
 nl:"Technologie|Niet ingevuld|Percentage|Maximaal niveau|Vergrendeld|Voorwaarde / vereiste (optioneel)|Opslaan|Annuleren|Lokaal opgeslagen|Cloudopslag bevestigd|Cloud niet bevestigd — lokale kopie bewaard|Voer een percentage van 0 tot 100 in.|Gegevens of account gewijzigd: annuleer en probeer opnieuw.|Lokaal opslaan mislukt: invoer bewaard.",
 zh:"科技|未填写|百分比|最高等级|已锁定|条件／前提（可选）|保存|取消|已保存在本地|云端保存已确认|云端未确认 — 已保留本地副本|请输入0到100之间的百分比。|数据或账户已更改：请取消后重试。|本地保存失败：已保留输入。",
 ja:"科学研究|未入力|パーセント|最大レベル|ロック中|条件・前提（任意）|保存|キャンセル|端末に保存済み|クラウド保存確認済み|クラウド未確認 — 端末のコピーを保持|0から100までの割合を入力してください。|データまたはアカウントが変更されました。キャンセルして再試行してください。|端末への保存失敗：入力を保持しました。",
 ru:"Технологии|Не указано|Процент|Максимальный уровень|Заблокировано|Условие / требование (необязательно)|Сохранить|Отмена|Сохранено локально|Сохранение в облаке подтверждено|Облако не подтверждено — локальная копия сохранена|Введите процент от 0 до 100.|Данные или аккаунт изменены: отмените и повторите.|Ошибка локального сохранения: ввод сохранён.",
 ar:"التكنولوجيا|غير محدد|نسبة مئوية|المستوى الأقصى|مقفل|شرط / متطلب (اختياري)|حفظ|إلغاء|تم الحفظ محليًا|تم تأكيد الحفظ السحابي|السحابة غير مؤكدة — النسخة المحلية محفوظة|أدخل نسبة بين 0 و100.|تغيرت البيانات أو الحساب: ألغِ وأعد المحاولة.|فشل الحفظ المحلي: تم الاحتفاظ بالإدخال.",
 pl:"Technologia|Nie podano|Procent|Poziom maksymalny|Zablokowane|Warunek / wymaganie (opcjonalne)|Zapisz|Anuluj|Zapisano lokalnie|Zapis w chmurze potwierdzony|Chmura niepotwierdzona — kopia lokalna zachowana|Wpisz procent od 0 do 100.|Dane lub konto zmienione: anuluj i spróbuj ponownie.|Zapis lokalny nieudany: wpis zachowany.",
 tr:"Teknoloji|Belirtilmedi|Yüzde|Maksimum seviye|Kilitli|Koşul / ön gereksinim (isteğe bağlı)|Kaydet|İptal|Yerel olarak kaydedildi|Bulut kaydı doğrulandı|Bulut doğrulanmadı — yerel kopya korundu|0 ile 100 arasında bir yüzde girin.|Veri veya hesap değişti: iptal edip yeniden deneyin.|Yerel kayıt başarısız: giriş korundu.",
 ko:"기술|미입력|백분율|최대 레벨|잠김|조건 / 선행 조건 (선택)|저장|취소|기기에 저장됨|클라우드 저장 확인됨|클라우드 미확인 — 로컬 사본 유지|0에서 100 사이의 비율을 입력하세요.|데이터 또는 계정이 변경됨: 취소 후 다시 시도하세요.|로컬 저장 실패: 입력 유지됨.",
 vi:"Công nghệ|Chưa nhập|Phần trăm|Cấp tối đa|Đã khóa|Điều kiện / yêu cầu (tùy chọn)|Lưu|Hủy|Đã lưu cục bộ|Đã xác nhận lưu đám mây|Chưa xác nhận đám mây — giữ bản cục bộ|Nhập phần trăm từ 0 đến 100.|Dữ liệu hoặc tài khoản đã đổi: hủy rồi thử lại.|Lưu cục bộ thất bại: giữ nội dung nhập.",
 th:"เทคโนโลยี|ยังไม่ระบุ|เปอร์เซ็นต์|ระดับสูงสุด|ล็อกอยู่|เงื่อนไข / ข้อกำหนด (ไม่บังคับ)|บันทึก|ยกเลิก|บันทึกในเครื่องแล้ว|ยืนยันการบันทึกบนคลาวด์แล้ว|คลาวด์ยังไม่ยืนยัน — เก็บสำเนาในเครื่อง|ป้อนเปอร์เซ็นต์ตั้งแต่ 0 ถึง 100|ข้อมูลหรือบัญชีเปลี่ยนแล้ว: ยกเลิกและลองใหม่|บันทึกในเครื่องไม่สำเร็จ: เก็บข้อมูลที่ป้อนแล้ว",
 id:"Teknologi|Belum diisi|Persentase|Level maksimum|Terkunci|Syarat / prasyarat (opsional)|Simpan|Batal|Tersimpan lokal|Penyimpanan cloud dikonfirmasi|Cloud belum dikonfirmasi — salinan lokal disimpan|Masukkan persentase dari 0 hingga 100.|Data atau akun berubah: batalkan lalu coba lagi.|Gagal menyimpan lokal: masukan dipertahankan.",
 uk:"Технології|Не вказано|Відсоток|Максимальний рівень|Заблоковано|Умова / вимога (необов’язково)|Зберегти|Скасувати|Збережено локально|Хмарне збереження підтверджено|Хмару не підтверджено — локальну копію збережено|Введіть відсоток від 0 до 100.|Дані або обліковий запис змінено: скасуйте й повторіть.|Помилка локального збереження: введення збережено.",
 ro:"Tehnologie|Necompletat|Procent|Nivel maxim|Blocat|Condiție / cerință (opțional)|Salvează|Anulează|Salvat local|Salvarea în cloud confirmată|Cloud neconfirmat — copie locală păstrată|Introdu un procent între 0 și 100.|Date sau cont schimbat: anulează și reîncearcă.|Salvare locală eșuată: datele introduse sunt păstrate.",
 el:"Τεχνολογία|Δεν δηλώθηκε|Ποσοστό|Μέγιστο επίπεδο|Κλειδωμένο|Συνθήκη / προϋπόθεση (προαιρετικό)|Αποθήκευση|Ακύρωση|Αποθηκεύτηκε τοπικά|Επιβεβαιώθηκε η αποθήκευση στο νέφος|Μη επιβεβαιωμένο νέφος — τοπικό αντίγραφο διατηρήθηκε|Εισαγάγετε ποσοστό από 0 έως 100.|Άλλαξαν δεδομένα ή λογαριασμός: ακυρώστε και δοκιμάστε ξανά.|Αποτυχία τοπικής αποθήκευσης: η εισαγωγή διατηρήθηκε.",
 cs:"Technologie|Nevyplněno|Procento|Maximální úroveň|Zamčeno|Podmínka / předpoklad (volitelné)|Uložit|Zrušit|Uloženo místně|Uložení do cloudu potvrzeno|Cloud nepotvrzen — místní kopie zachována|Zadejte procento od 0 do 100.|Data nebo účet změněny: zrušte a zkuste znovu.|Místní uložení selhalo: vstup zachován.",
 sv:"Teknik|Inte angivet|Procent|Maxnivå|Låst|Villkor / förutsättning (valfritt)|Spara|Avbryt|Sparat lokalt|Molnlagring bekräftad|Molnet ej bekräftat — lokal kopia sparad|Ange en procentsats från 0 till 100.|Data eller konto ändrat: avbryt och försök igen.|Lokal lagring misslyckades: inmatning sparad."
};
const names={
 fr:"Développement|Économie|Héros|Unités|Équipe 1|Équipe 2|Équipe 3|Duel d’alliances|Camion interurbain|Forces spéciales|Assiéger pour saisir|Fortification des défenses|Spécialisation tank|Spécialisation missile|Spécialisation avion|Ère du pétrole|Équipe 4|Arme tactique",
 en:"Development|Economy|Heroes|Units|Team 1|Team 2|Team 3|Alliance Duel|Intercity Truck|Special Forces|Siege to Seize|Defensive Fortification|Tank Specialization|Missile Specialization|Aircraft Specialization|Oil Era|Team 4|Tactical Weapon",
 es:"Desarrollo|Economía|Héroes|Unidades|Equipo 1|Equipo 2|Equipo 3|Duelo de alianzas|Camión interurbano|Fuerzas especiales|Asediar para conquistar|Fortificación defensiva|Especialización tanque|Especialización misil|Especialización avión|Era del petróleo|Equipo 4|Arma táctica",
 it:"Sviluppo|Economia|Eroi|Unità|Squadra 1|Squadra 2|Squadra 3|Duello alleanze|Camion interurbano|Forze speciali|Assedio e conquista|Fortificazione difensiva|Specializzazione carri|Specializzazione missili|Specializzazione aerei|Era del petrolio|Squadra 4|Arma tattica",
 de:"Entwicklung|Wirtschaft|Helden|Einheiten|Team 1|Team 2|Team 3|Allianzduell|Überland-Lkw|Spezialkräfte|Belagerung und Eroberung|Verteidigungsbefestigung|Panzerspezialisierung|Raketenspezialisierung|Flugzeugspezialisierung|Ölzeitalter|Team 4|Taktische Waffe",
 pt:"Desenvolvimento|Economia|Heróis|Unidades|Equipa 1|Equipa 2|Equipa 3|Duelo de alianças|Camião interurbano|Forças especiais|Cerco e conquista|Fortificação defensiva|Especialização tanque|Especialização míssil|Especialização avião|Era do petróleo|Equipa 4|Arma tática",
 nl:"Ontwikkeling|Economie|Helden|Eenheden|Team 1|Team 2|Team 3|Alliantieduel|Intercityvrachtwagen|Speciale strijdkrachten|Belegeren en veroveren|Verdedigingsversterking|Tankspecialisatie|Raketspecialisatie|Vliegtuigspecialisatie|Olietijdperk|Team 4|Tactisch wapen",
 zh:"发展|经济|英雄|单位|队伍1|队伍2|队伍3|联盟对决|城际卡车|特种部队|攻城掠地|防御工事|坦克专精|导弹专精|飞机专精|石油时代|队伍4|战术武器",
 ja:"発展|経済|英雄|ユニット|部隊1|部隊2|部隊3|同盟対決|都市間トラック|特殊部隊|攻城と占領|防御要塞|戦車特化|ミサイル特化|航空機特化|石油時代|部隊4|戦術兵器",
 ru:"Развитие|Экономика|Герои|Войска|Отряд 1|Отряд 2|Отряд 3|Дуэль альянсов|Межгородской грузовик|Спецназ|Осада и захват|Укрепление обороны|Специализация танков|Специализация ракет|Специализация авиации|Нефтяная эра|Отряд 4|Тактическое оружие",
 ar:"التطوير|الاقتصاد|الأبطال|الوحدات|الفريق 1|الفريق 2|الفريق 3|مبارزة التحالفات|الشاحنة بين المدن|القوات الخاصة|الحصار والاستيلاء|تحصين الدفاعات|تخصص الدبابات|تخصص الصواريخ|تخصص الطائرات|عصر النفط|الفريق 4|السلاح التكتيكي",
 pl:"Rozwój|Ekonomia|Bohaterowie|Jednostki|Drużyna 1|Drużyna 2|Drużyna 3|Pojedynek sojuszy|Ciężarówka międzymiastowa|Siły specjalne|Oblężenie i zdobycie|Umocnienia obronne|Specjalizacja czołgów|Specjalizacja rakiet|Specjalizacja lotnictwa|Era ropy|Drużyna 4|Broń taktyczna",
 tr:"Gelişim|Ekonomi|Kahramanlar|Birimler|Takım 1|Takım 2|Takım 3|İttifak düellosu|Şehirler arası kamyon|Özel kuvvetler|Kuşatma ve ele geçirme|Savunma tahkimatı|Tank uzmanlığı|Füze uzmanlığı|Uçak uzmanlığı|Petrol çağı|Takım 4|Taktik silah",
 ko:"발전|경제|영웅|유닛|부대 1|부대 2|부대 3|연맹 대결|도시간 트럭|특수부대|공성 및 점령|방어 요새화|전차 특화|미사일 특화|항공기 특화|석유 시대|부대 4|전술 무기",
 vi:"Phát triển|Kinh tế|Anh hùng|Đơn vị|Đội 1|Đội 2|Đội 3|Đấu liên minh|Xe tải liên thành|Lực lượng đặc biệt|Vây hãm chiếm giữ|Củng cố phòng thủ|Chuyên môn xe tăng|Chuyên môn tên lửa|Chuyên môn máy bay|Kỷ nguyên dầu mỏ|Đội 4|Vũ khí chiến thuật",
 th:"การพัฒนา|เศรษฐกิจ|ฮีโร่|หน่วยรบ|ทีม 1|ทีม 2|ทีม 3|ดวลพันธมิตร|รถบรรทุกระหว่างเมือง|กองกำลังพิเศษ|ล้อมเพื่อยึดครอง|เสริมป้อมป้องกัน|ความชำนาญรถถัง|ความชำนาญขีปนาวุธ|ความชำนาญเครื่องบิน|ยุคน้ำมัน|ทีม 4|อาวุธยุทธวิธี",
 id:"Pengembangan|Ekonomi|Pahlawan|Unit|Tim 1|Tim 2|Tim 3|Duel aliansi|Truk antarkota|Pasukan khusus|Pengepungan dan perebutan|Benteng pertahanan|Spesialisasi tank|Spesialisasi rudal|Spesialisasi pesawat|Era minyak|Tim 4|Senjata taktis",
 uk:"Розвиток|Економіка|Герої|Війська|Загін 1|Загін 2|Загін 3|Дуель альянсів|Міжміська вантажівка|Спецпризначенці|Облога й захоплення|Укріплення оборони|Спеціалізація танків|Спеціалізація ракет|Спеціалізація авіації|Нафтова ера|Загін 4|Тактична зброя",
 ro:"Dezvoltare|Economie|Eroi|Unități|Echipa 1|Echipa 2|Echipa 3|Duelul alianțelor|Camion interurban|Forțe speciale|Asediu și cucerire|Fortificație defensivă|Specializare tancuri|Specializare rachete|Specializare avioane|Era petrolului|Echipa 4|Armă tactică",
 el:"Ανάπτυξη|Οικονομία|Ήρωες|Μονάδες|Ομάδα 1|Ομάδα 2|Ομάδα 3|Μονομαχία συμμαχιών|Υπεραστικό φορτηγό|Ειδικές δυνάμεις|Πολιορκία και κατάληψη|Αμυντική οχύρωση|Εξειδίκευση αρμάτων|Εξειδίκευση πυραύλων|Εξειδίκευση αεροσκαφών|Εποχή πετρελαίου|Ομάδα 4|Τακτικό όπλο",
 cs:"Rozvoj|Ekonomika|Hrdinové|Jednotky|Tým 1|Tým 2|Tým 3|Souboj aliancí|Meziměstský náklaďák|Speciální síly|Obléhání a dobytí|Obranné opevnění|Specializace tanků|Specializace raket|Specializace letadel|Ropná éra|Tým 4|Taktická zbraň",
 sv:"Utveckling|Ekonomi|Hjältar|Enheter|Lag 1|Lag 2|Lag 3|Alliansduell|Intercitylastbil|Specialstyrkor|Belägring och erövring|Försvarsbefästning|Stridsvagnsspecialisering|Missilspecialisering|Flygplansspecialisering|Oljeeran|Lag 4|Taktiskt vapen"
};
export const TECHNOLOGY_MANUAL_LOCALES=Object.keys(controls);
const compact={
 fr:"Brouillon non enregistré|Scan",en:"Unsaved draft|Scan",es:"Borrador sin guardar|Escaneo",
 it:"Bozza non salvata|Scansione",de:"Ungespeicherter Entwurf|Scan",pt:"Rascunho não guardado|Digitalização",
 nl:"Niet-opgeslagen concept|Scan",zh:"未保存的草稿|扫描",ja:"未保存の下書き|スキャン",
 ru:"Несохранённый черновик|Сканирование",ar:"مسودة غير محفوظة|مسح",
 pl:"Niezapisany szkic|Skan",tr:"Kaydedilmemiş taslak|Tarama",ko:"저장하지 않은 초안|스캔",
 vi:"Bản nháp chưa lưu|Quét",th:"ฉบับร่างที่ยังไม่บันทึก|สแกน",id:"Draf belum disimpan|Pindai",
 uk:"Незбережена чернетка|Сканування",ro:"Ciornă nesalvată|Scanare",el:"Μη αποθηκευμένο πρόχειρο|Σάρωση",
 cs:"Neuložený koncept|Sken",sv:"Osparat utkast|Skanning"
};
const manual={
 fr:"Saisie manuelle",en:"Manual entry",es:"Entrada manual",it:"Inserimento manuale",de:"Manuelle Eingabe",pt:"Entrada manual",
 nl:"Handmatige invoer",zh:"手动输入",ja:"手動入力",ru:"Ручной ввод",ar:"إدخال يدوي",pl:"Wpis ręczny",tr:"Manuel giriş",
 ko:"수동 입력",vi:"Nhập thủ công",th:"ป้อนด้วยตนเอง",id:"Masukan manual",uk:"Ручне введення",ro:"Introducere manuală",
 el:"Χειροκίνητη εισαγωγή",cs:"Ruční zadání",sv:"Manuell inmatning"
};
export function technologyManualCopy(locale){
 const lang=String(locale||"en").split(/[-_]/)[0];
 const [draft,scan]=(compact[lang]||compact.en).split("|");
 return {text:(controls[lang]||controls.en).split("|"),names:(names[lang]||names.en).split("|"),manual:manual[lang]||manual.en,draft,scan,dir:lang==="ar"?"rtl":"ltr"};
}
