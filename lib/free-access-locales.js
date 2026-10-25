// Complete UI packs, not automatic substitutions over player/gameplay data.
const keys=["title","privacy","note","request","create","verification","existing","draftLabel","saveDraft","replaceDraft","workspaceOpen","workspaceRequest","workspaceView","workspaceList","review","approve","reject","error","confirmEmail","optional","externalSafety"];
const rows={
es:[
"Cuenta WarBoost FREE","Acepto enviar los datos que decida sincronizar o analizar conforme a la política de privacidad.",
"Sin código ni invitación. Alianza opcional. PRO y gestión de alianza son derechos distintos.",
"Solicitar unirme a mi alianza","Crear / recuperar mi espacio de alianza",
"Un rango declarado no autoriza a gestionar una alianza existente. Se necesitan pruebas independientes de identidad y rango R4/R5.",
"Este espacio ya existe: solicita acceso. No necesitas ningún código.",
"Borrador privado: un apodo por línea; rango opcional R1–R5, por ejemplo Apodo ; R3. Máximo 100 nombres.",
"Guardar borrador privado","¿Recargar el borrador guardado y descartar los cambios sin guardar?",
"Abrir la admisión de mi espacio WarBoost","Solicitar acceso a este espacio","Abrir la plantilla compartida","Gestionar solicitudes del espacio",
"Solicitudes de ingreso","Aprobar","Rechazar","Acción no confirmada. Tus datos se conservan.","Confirma tu dirección de correo electrónico.","Opcional",
"Puedes revocar el consentimiento en este dispositivo. El acceso externo al juego Last War está desactivado."
],
it:[
"Account WarBoost FREE","Acconsento all'invio dei dati che scelgo di sincronizzare o analizzare secondo la politica sulla privacy.",
"Senza codice né invito. Alleanza facoltativa. PRO e gestione dell'alleanza sono diritti distinti.",
"Chiedere di entrare nella mia alleanza","Creare / ritrovare il mio spazio di alleanza",
"Un grado dichiarato non autorizza a gestire un'alleanza esistente. Servono prove indipendenti di identità e grado R4/R5.",
"Questo spazio esiste già: richiedi l'accesso. Nessun codice necessario.",
"Bozza privata: un nome per riga; grado facoltativo R1–R5, ad esempio Nome ; R3. Massimo 100 nomi.",
"Salvare la bozza privata","Ricaricare la bozza salvata e scartare le modifiche non salvate?",
"Aprire l'accoglienza del mio spazio WarBoost","Richiedere accesso a questo spazio","Aprire il roster condiviso","Gestire le richieste dello spazio",
"Richieste di adesione","Approvare","Rifiutare","Azione non confermata. I tuoi dati sono conservati.","Conferma il tuo indirizzo e-mail.","Facoltativa",
"Puoi revocare il consenso su questo dispositivo. L'accesso esterno al gioco Last War è disattivato."
],
de:[
"WarBoost-FREE-Konto","Ich stimme der Übermittlung der von mir zur Synchronisierung oder Analyse gewählten Daten gemäß der Datenschutzerklärung zu.",
"Ohne Code oder Einladung. Allianz optional. PRO und Allianzverwaltung sind getrennte Rechte.",
"Beitritt zu meiner Allianz beantragen","Meinen Allianzbereich erstellen / wiederfinden",
"Ein angegebener Rang berechtigt nicht zur Verwaltung einer bestehenden Allianz. Unabhängige Nachweise für Identität und R4/R5 sind nötig.",
"Dieser Bereich besteht bereits: Zugang beantragen. Kein Code erforderlich.",
"Privater Entwurf: ein Name je Zeile; Rang R1–R5 optional, zum Beispiel Name ; R3. Höchstens 100 Namen.",
"Privaten Entwurf speichern","Gespeicherten Entwurf laden und ungespeicherte Änderungen verwerfen?",
"Aufnahme in meinen WarBoost-Bereich öffnen","Zugang zu diesem Bereich beantragen","Gemeinsame Mitgliederliste öffnen","Anfragen des Bereichs verwalten",
"Beitrittsanfragen","Genehmigen","Ablehnen","Aktion nicht bestätigt. Deine Daten bleiben erhalten.","Bestätige deine E-Mail-Adresse.","Optional",
"Du kannst die Einwilligung auf diesem Gerät widerrufen. Externer Zugriff auf Last War ist deaktiviert."
],
pt:[
"Conta WarBoost FREE","Aceito enviar os dados que escolher sincronizar ou analisar, de acordo com a política de privacidade.",
"Sem código nem convite. Aliança facultativa. PRO e gestão da aliança são direitos separados.",
"Pedir para entrar na minha aliança","Criar / recuperar o meu espaço de aliança",
"Uma patente declarada não autoriza gerir uma aliança existente. São necessárias provas independentes de identidade e patente R4/R5.",
"Este espaço já existe: pede acesso. Não é necessário código.",
"Rascunho privado: um nome por linha; patente R1–R5 facultativa, por exemplo Nome ; R3. Máximo 100 nomes.",
"Guardar rascunho privado","Recarregar o rascunho guardado e descartar alterações não guardadas?",
"Abrir a admissão no meu espaço WarBoost","Pedir acesso a este espaço","Abrir a lista partilhada","Gerir pedidos do espaço",
"Pedidos de adesão","Aprovar","Recusar","Ação não confirmada. Os teus dados são preservados.","Confirma o teu endereço de e-mail.","Facultativa",
"Podes revogar o consentimento neste dispositivo. O acesso externo ao jogo Last War está desativado."
],
nl:[
"WarBoost FREE-account","Ik stem in met het verzenden van gegevens die ik wil synchroniseren of analyseren volgens het privacybeleid.",
"Geen code of uitnodiging. Alliantie optioneel. PRO en alliantiebeheer zijn aparte rechten.",
"Lidmaatschap van mijn alliantie aanvragen","Mijn alliantieruimte maken / terugvinden",
"Een opgegeven rang geeft geen beheerrecht over een bestaande alliantie. Onafhankelijk bewijs van identiteit en R4/R5 is vereist.",
"Deze ruimte bestaat al: vraag toegang aan. Geen code nodig.",
"Privéconcept: één naam per regel; rang R1–R5 optioneel, bijvoorbeeld Naam ; R3. Maximaal 100 namen.",
"Privéconcept opslaan","Opgeslagen concept laden en niet-opgeslagen wijzigingen weggooien?",
"Toelating tot mijn WarBoost-ruimte openen","Toegang tot deze ruimte aanvragen","Gedeelde ledenlijst openen","Aanvragen voor de ruimte beheren",
"Lidmaatschapsaanvragen","Goedkeuren","Afwijzen","Actie niet bevestigd. Je gegevens blijven behouden.","Bevestig je e-mailadres.","Optioneel",
"Je kunt toestemming op dit apparaat intrekken. Externe toegang tot Last War is uitgeschakeld."
],
zh:[
"WarBoost FREE账号","我同意按隐私政策发送我选择同步或分析的数据。",
"无需代码或邀请。联盟可选。PRO与联盟管理权限相互独立。",
"申请加入我的联盟","创建或找回我的联盟空间",
"声明军阶不能获得现有联盟的管理权。必须提供独立的身份及R4/R5军阶证明。",
"此空间已存在：请申请访问，无需代码。",
"私人草稿：每行一个昵称；军阶R1至R5可选，例如 昵称 ; R3。最多100个名字。",
"保存私人草稿","重新加载已保存草稿并放弃未保存的修改？",
"开放我的WarBoost空间申请","申请访问此空间","打开共享成员名单","管理空间申请",
"加入申请","批准","拒绝","操作未确认。数据保留。","请验证你的电子邮箱。","可选",
"可在此设备撤回同意。访问Last War游戏的外部功能已停用。"
],
ja:[
"WarBoost FREEアカウント","プライバシーポリシーに従い、選択したデータの同期・分析のための送信に同意します。",
"コードや招待は不要です。同盟は任意。PROと同盟管理の権限は別です。",
"自分の同盟への参加を申請","同盟スペースを作成・再表示",
"階級の申告だけでは既存同盟を管理できません。本人確認とR4/R5階級の独立した証拠が必要です。",
"このスペースは既に存在します。コード不要でアクセスを申請してください。",
"非公開の下書き：1行1名。階級R1～R5は任意、例：名前 ; R3。最大100名。",
"非公開の下書きを保存","保存済みの下書きを読み込み、未保存の変更を破棄しますか？",
"自分のWarBoostスペースの受付を開始","このスペースへのアクセスを申請","共有名簿を開く","スペースの申請を管理",
"参加申請","承認","拒否","操作は未確認です。データは保持されています。","メールアドレスを確認してください。","任意",
"この端末で同意を取り消せます。Last Warへの外部アクセスは無効です。"
],
ru:[
"Аккаунт WarBoost FREE","Я соглашаюсь на отправку выбранных для синхронизации или анализа данных согласно политике конфиденциальности.",
"Без кода и приглашения. Альянс необязателен. PRO и управление альянсом — разные права.",
"Запросить вступление в мой альянс","Создать / найти пространство моего альянса",
"Заявленный ранг не даёт управления существующим альянсом. Нужны независимые доказательства личности и ранга R4/R5.",
"Это пространство уже существует: запросите доступ. Код не нужен.",
"Личный черновик: одно имя на строку; ранг R1–R5 необязателен, например Имя ; R3. До 100 имён.",
"Сохранить личный черновик","Загрузить сохранённый черновик и отбросить несохранённые изменения?",
"Открыть приём в моё пространство WarBoost","Запросить доступ к пространству","Открыть общий список","Управлять заявками пространства",
"Заявки на вступление","Одобрить","Отклонить","Действие не подтверждено. Данные сохранены.","Подтвердите адрес электронной почты.","Необязательно",
"Согласие можно отозвать на этом устройстве. Внешний доступ к игре Last War отключён."
],
ar:[
"حساب WarBoost FREE","أوافق على إرسال البيانات التي أختار مزامنتها أو تحليلها وفق سياسة الخصوصية.",
"بلا رمز أو دعوة. التحالف اختياري. حقوق PRO وإدارة التحالف منفصلة.",
"طلب الانضمام إلى تحالفي","إنشاء أو استرجاع مساحة تحالفي",
"إعلان الرتبة لا يمنح إدارة تحالف قائم. يلزم دليل مستقل على الهوية ورتبة R4/R5.",
"هذه المساحة موجودة بالفعل: اطلب الوصول. لا حاجة إلى رمز.",
"مسودة خاصة: اسم في كل سطر؛ رتبة R1 إلى R5 اختيارية، مثال اسم ; R3. الحد 100 اسم.",
"حفظ المسودة الخاصة","إعادة تحميل المسودة المحفوظة وإلغاء التعديلات غير المحفوظة؟",
"فتح استقبال الطلبات في مساحتي WarBoost","طلب الوصول إلى هذه المساحة","فتح قائمة الأعضاء المشتركة","إدارة طلبات المساحة",
"طلبات الانضمام","قبول","رفض","لم تؤكد العملية. بياناتك محفوظة.","أكد عنوان بريدك الإلكتروني.","اختياري",
"يمكن سحب الموافقة على هذا الجهاز. الوصول الخارجي إلى لعبة Last War معطل."
],
pl:[
"Konto WarBoost FREE","Zgadzam się na przesyłanie danych wybranych do synchronizacji lub analizy zgodnie z polityką prywatności.",
"Bez kodu i zaproszenia. Sojusz opcjonalny. PRO i zarządzanie sojuszem to odrębne prawa.",
"Poproś o dołączenie do mojego sojuszu","Utwórz / odszukaj przestrzeń mojego sojuszu",
"Zadeklarowana ranga nie uprawnia do zarządzania istniejącym sojuszem. Potrzebne są niezależne dowody tożsamości i rangi R4/R5.",
"Ta przestrzeń już istnieje: poproś o dostęp. Kod nie jest potrzebny.",
"Prywatny szkic: jedno imię na wiersz; ranga R1–R5 opcjonalna, np. Nazwa ; R3. Maksymalnie 100 nazw.",
"Zapisz prywatny szkic","Wczytać zapisany szkic i odrzucić niezapisane zmiany?",
"Otwórz przyjmowanie do mojej przestrzeni WarBoost","Poproś o dostęp do przestrzeni","Otwórz wspólną listę","Zarządzaj wnioskami przestrzeni",
"Wnioski o dołączenie","Zatwierdź","Odrzuć","Działanie niepotwierdzone. Twoje dane pozostają zachowane.","Potwierdź adres e-mail.","Opcjonalny",
"Zgodę można cofnąć na tym urządzeniu. Zewnętrzny dostęp do gry Last War jest wyłączony."
],
tr:[
"WarBoost FREE hesabı","Gizlilik politikasına göre eşitlemeyi veya analiz etmeyi seçtiğim verilerin gönderilmesini kabul ediyorum.",
"Kod veya davet gerekmez. İttifak isteğe bağlıdır. PRO ve ittifak yönetimi ayrı haklardır.",
"İttifakıma katılmayı iste","İttifak alanımı oluştur / bul",
"Beyan edilen rütbe mevcut ittifakı yönetme yetkisi vermez. Kimlik ve R4/R5 için bağımsız kanıt gerekir.",
"Bu alan zaten mevcut: erişim iste. Kod gerekmez.",
"Özel taslak: her satıra bir ad; R1–R5 rütbesi isteğe bağlı, örnek Ad ; R3. En fazla 100 ad.",
"Özel taslağı kaydet","Kayıtlı taslak yüklensin ve kaydedilmemiş değişiklikler silinsin mi?",
"WarBoost alanımın başvurularını aç","Bu alana erişim iste","Ortak üye listesini aç","Alan başvurularını yönet",
"Katılım başvuruları","Onayla","Reddet","İşlem doğrulanmadı. Verilerin korunuyor.","E-posta adresini doğrula.","İsteğe bağlı",
"Bu cihazda onayını geri alabilirsin. Last War oyununa dış erişim devre dışıdır."
],
ko:[
"WarBoost FREE 계정","개인정보 처리방침에 따라 동기화나 분석을 선택한 데이터 전송에 동의합니다.",
"코드나 초대가 필요 없습니다. 연맹은 선택이며 PRO와 연맹 관리 권한은 별개입니다.",
"내 연맹 가입 신청","내 연맹 공간 만들기 / 찾기",
"계급 신고만으로 기존 연맹을 관리할 수 없습니다. 신원과 R4/R5 계급의 독립적 증거가 필요합니다.",
"이미 있는 공간입니다. 코드 없이 접근을 신청하세요.",
"비공개 초안: 한 줄에 닉네임 하나. R1~R5 계급은 선택, 예: 닉네임 ; R3. 최대 100명.",
"비공개 초안 저장","저장된 초안을 불러오고 저장하지 않은 변경 사항을 버릴까요?",
"내 WarBoost 공간 신청 접수 열기","이 공간 접근 신청","공유 명단 열기","공간 신청 관리",
"가입 신청","승인","거절","작업이 확인되지 않았습니다. 데이터는 유지됩니다.","이메일 주소를 인증하세요.","선택",
"이 기기에서 동의를 철회할 수 있습니다. Last War 게임 외부 접근은 비활성화되어 있습니다."
],
vi:[
"Tài khoản WarBoost FREE","Tôi đồng ý gửi dữ liệu mình chọn đồng bộ hoặc phân tích theo chính sách quyền riêng tư.",
"Không mã hay lời mời. Liên minh tùy chọn. PRO và quyền quản lý liên minh tách biệt.",
"Xin gia nhập liên minh của tôi","Tạo / tìm lại không gian liên minh",
"Cấp tự khai không cho phép quản lý liên minh có sẵn. Cần bằng chứng độc lập về danh tính và cấp R4/R5.",
"Không gian này đã có: hãy xin truy cập. Không cần mã.",
"Bản nháp riêng: một tên mỗi dòng; cấp R1–R5 tùy chọn, ví dụ Tên ; R3. Tối đa 100 tên.",
"Lưu bản nháp riêng","Tải lại bản nháp đã lưu và bỏ thay đổi chưa lưu?",
"Mở nhận yêu cầu vào không gian WarBoost","Xin truy cập không gian này","Mở danh sách chung","Quản lý yêu cầu của không gian",
"Yêu cầu gia nhập","Duyệt","Từ chối","Thao tác chưa được xác nhận. Dữ liệu được giữ nguyên.","Xác nhận địa chỉ email của bạn.","Tùy chọn",
"Có thể rút lại đồng ý trên thiết bị này. Truy cập bên ngoài vào trò chơi Last War bị tắt."
],
th:[
"บัญชี WarBoost FREE","ฉันยินยอมส่งข้อมูลที่เลือกซิงค์หรือวิเคราะห์ตามนโยบายความเป็นส่วนตัว",
"ไม่ต้องใช้รหัสหรือคำเชิญ พันธมิตรเป็นตัวเลือก สิทธิ์ PRO แยกจากการจัดการพันธมิตร",
"ขอเข้าร่วมพันธมิตรของฉัน","สร้าง / ค้นพื้นที่พันธมิตรของฉัน",
"ยศที่แจ้งไม่ให้สิทธิ์จัดการพันธมิตรที่มีอยู่ ต้องมีหลักฐานอิสระยืนยันตัวตนและยศ R4/R5",
"พื้นที่นี้มีอยู่แล้ว ให้ขอเข้าถึง ไม่ต้องใช้รหัส",
"ร่างส่วนตัว: หนึ่งชื่อต่อบรรทัด ยศ R1–R5 ไม่บังคับ เช่น ชื่อ ; R3 สูงสุด 100 ชื่อ",
"บันทึกร่างส่วนตัว","โหลดร่างที่บันทึกแล้วและทิ้งการแก้ไขที่ยังไม่บันทึกหรือไม่?",
"เปิดรับคำขอในพื้นที่ WarBoost ของฉัน","ขอเข้าถึงพื้นที่นี้","เปิดรายชื่อร่วม","จัดการคำขอของพื้นที่",
"คำขอเข้าร่วม","อนุมัติ","ปฏิเสธ","ยังไม่ยืนยันการทำงาน ข้อมูลยังคงอยู่","ยืนยันที่อยู่อีเมลของคุณ","ไม่บังคับ",
"ถอนความยินยอมบนอุปกรณ์นี้ได้ การเข้าถึงเกม Last War จากภายนอกปิดอยู่"
],
id:[
"Akun WarBoost FREE","Saya menyetujui pengiriman data yang saya pilih untuk disinkronkan atau dianalisis sesuai kebijakan privasi.",
"Tanpa kode atau undangan. Aliansi opsional. PRO dan pengelolaan aliansi adalah hak terpisah.",
"Minta bergabung dengan aliansi saya","Buat / temukan ruang aliansi saya",
"Pangkat pernyataan tidak memberi hak mengelola aliansi yang ada. Perlu bukti independen identitas dan pangkat R4/R5.",
"Ruang ini sudah ada: minta akses. Tidak perlu kode.",
"Draf privat: satu nama tiap baris; pangkat R1–R5 opsional, contoh Nama ; R3. Maksimal 100 nama.",
"Simpan draf privat","Muat ulang draf tersimpan dan buang perubahan yang belum disimpan?",
"Buka penerimaan di ruang WarBoost saya","Minta akses ke ruang ini","Buka daftar bersama","Kelola permintaan ruang",
"Permintaan bergabung","Setujui","Tolak","Tindakan belum dikonfirmasi. Data tetap tersimpan.","Konfirmasikan alamat email Anda.","Opsional",
"Persetujuan dapat dicabut di perangkat ini. Akses eksternal ke permainan Last War dinonaktifkan."
],
uk:[
"Обліковий запис WarBoost FREE","Погоджуюся на надсилання вибраних для синхронізації чи аналізу даних згідно з політикою приватності.",
"Без коду та запрошення. Альянс необов’язковий. PRO та керування альянсом — різні права.",
"Попросити вступ до мого альянсу","Створити / знайти простір мого альянсу",
"Заявлений ранг не дозволяє керувати наявним альянсом. Потрібні незалежні докази особи та рангу R4/R5.",
"Цей простір уже існує: попросіть доступ. Код не потрібен.",
"Приватна чернетка: одне ім’я на рядок; ранг R1–R5 необов’язковий, наприклад Ім’я ; R3. До 100 імен.",
"Зберегти приватну чернетку","Завантажити збережену чернетку й відкинути незбережені зміни?",
"Відкрити прийом до мого простору WarBoost","Попросити доступ до простору","Відкрити спільний список","Керувати заявками простору",
"Заявки на вступ","Схвалити","Відхилити","Дію не підтверджено. Дані збережено.","Підтвердьте адресу електронної пошти.","Необов’язково",
"Згоду можна відкликати на цьому пристрої. Зовнішній доступ до гри Last War вимкнено."
],
ro:[
"Cont WarBoost FREE","Accept trimiterea datelor pe care aleg să le sincronizez sau analizez conform politicii de confidențialitate.",
"Fără cod sau invitație. Alianță opțională. PRO și gestionarea alianței sunt drepturi separate.",
"Solicită aderarea la alianța mea","Creează / regăsește spațiul alianței mele",
"Un rang declarat nu permite gestionarea unei alianțe existente. Sunt necesare dovezi independente de identitate și rang R4/R5.",
"Acest spațiu există deja: cere acces. Nu este necesar niciun cod.",
"Schiță privată: un nume pe rând; rang R1–R5 opțional, de exemplu Nume ; R3. Maximum 100 nume.",
"Salvează schița privată","Reîncarci schița salvată și renunți la modificările nesalvate?",
"Deschide primirea în spațiul meu WarBoost","Cere acces la acest spațiu","Deschide lista comună","Gestionează cererile spațiului",
"Cereri de aderare","Aprobă","Refuză","Acțiune neconfirmată. Datele sunt păstrate.","Confirmă adresa de e-mail.","Opțională",
"Poți retrage acordul pe acest dispozitiv. Accesul extern la jocul Last War este dezactivat."
],
el:[
"Λογαριασμός WarBoost FREE","Συμφωνώ στην αποστολή δεδομένων που επιλέγω για συγχρονισμό ή ανάλυση σύμφωνα με την πολιτική απορρήτου.",
"Χωρίς κωδικό ή πρόσκληση. Προαιρετική συμμαχία. PRO και διαχείριση συμμαχίας είναι διαφορετικά δικαιώματα.",
"Αίτηση συμμετοχής στη συμμαχία μου","Δημιουργία / εύρεση χώρου συμμαχίας",
"Ο δηλωμένος βαθμός δεν επιτρέπει διαχείριση υπάρχουσας συμμαχίας. Απαιτούνται ανεξάρτητες αποδείξεις ταυτότητας και R4/R5.",
"Ο χώρος υπάρχει ήδη: ζήτησε πρόσβαση. Δεν χρειάζεται κωδικός.",
"Ιδιωτικό πρόχειρο: ένα όνομα ανά γραμμή· προαιρετικά R1–R5, π.χ. Όνομα ; R3. Έως 100 ονόματα.",
"Αποθήκευση ιδιωτικού προχείρου","Φόρτωση αποθηκευμένου προχείρου και απόρριψη μη αποθηκευμένων αλλαγών;",
"Άνοιγμα υποδοχής στον χώρο μου WarBoost","Αίτηση πρόσβασης σε αυτόν τον χώρο","Άνοιγμα κοινής λίστας","Διαχείριση αιτήσεων χώρου",
"Αιτήσεις συμμετοχής","Έγκριση","Απόρριψη","Η ενέργεια δεν επιβεβαιώθηκε. Τα δεδομένα διατηρούνται.","Επιβεβαίωσε τη διεύθυνση email.","Προαιρετική",
"Μπορείς να ανακαλέσεις τη συναίνεση στη συσκευή. Η εξωτερική πρόσβαση στο παιχνίδι Last War είναι απενεργοποιημένη."
],
cs:[
"Účet WarBoost FREE","Souhlasím s odesíláním dat, která vyberu k synchronizaci či analýze, podle zásad ochrany soukromí.",
"Bez kódu a pozvánky. Aliance je volitelná. PRO a správa aliance jsou samostatná práva.",
"Požádat o vstup do mé aliance","Vytvořit / najít prostor mé aliance",
"Deklarovaná hodnost neopravňuje ke správě existující aliance. Jsou nutné nezávislé důkazy totožnosti a hodnosti R4/R5.",
"Tento prostor už existuje: požádej o přístup. Kód není potřeba.",
"Soukromý návrh: jedno jméno na řádek; hodnost R1–R5 volitelná, např. Jméno ; R3. Nejvýše 100 jmen.",
"Uložit soukromý návrh","Načíst uložený návrh a zahodit neuložené změny?",
"Otevřít příjem do mého prostoru WarBoost","Požádat o přístup do prostoru","Otevřít společný seznam","Spravovat žádosti prostoru",
"Žádosti o vstup","Schválit","Odmítnout","Akce nepotvrzena. Data zůstávají zachována.","Potvrď svou e-mailovou adresu.","Volitelná",
"Souhlas lze na tomto zařízení odvolat. Externí přístup ke hře Last War je vypnutý."
],
sv:[
"WarBoost FREE-konto","Jag samtycker till att skicka data jag väljer att synkronisera eller analysera enligt integritetspolicyn.",
"Ingen kod eller inbjudan. Allians är valfri. PRO och allianshantering är separata rättigheter.",
"Begär att gå med i min allians","Skapa / hitta mitt alliansutrymme",
"Angiven rang ger inte rätt att hantera en befintlig allians. Oberoende bevis på identitet och R4/R5 krävs.",
"Utrymmet finns redan: begär åtkomst. Ingen kod behövs.",
"Privat utkast: ett namn per rad; rang R1–R5 valfri, till exempel Namn ; R3. Högst 100 namn.",
"Spara privat utkast","Läs in sparat utkast och kasta osparade ändringar?",
"Öppna ansökningar till mitt WarBoost-utrymme","Begär åtkomst till utrymmet","Öppna gemensam medlemslista","Hantera utrymmets ansökningar",
"Medlemsansökningar","Godkänn","Avslå","Åtgärden är inte bekräftad. Dina data bevaras.","Bekräfta din e-postadress.","Valfri",
"Du kan återkalla samtycket på denna enhet. Extern åtkomst till spelet Last War är inaktiverad."
]
};
export const FREE_ACCESS_LOCALES=Object.freeze(Object.keys(rows));
export function translatedFreeAccess(locale){
  const code=String(locale).toLowerCase().split(/[-_]/)[0];
  const row=Object.hasOwn(rows,code)?rows[code]:null;
  if(!row)return null;
  if(row.length!==keys.length)throw new Error("free_access_locale_incomplete");
  return Object.fromEntries(keys.map((key,i)=>[key,row[i]]));
}
