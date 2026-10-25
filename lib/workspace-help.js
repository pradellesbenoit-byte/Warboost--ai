// Localized, text-only guidance. No code, rank declaration or draft grants access.
const keys=["title","founder","member","trouble","security","emptyRoster","saved","dirty","opened","pending","approved","rejected","invalid","unverified","emptyRequests","free","roleMismatch"];
const rows={
fr:[
"Aide : compte et alliance",
"Fondateur : renseigne serveur et tag, puis crée ou retrouve ton espace. Dans le brouillon, écris un pseudo par ligne ; grade facultatif : Pseudo ; R3 (R1 à R5, sans point). Enregistre, puis ouvre l’accueil de l’espace. Lis le roster partagé et les demandes ; approuve ou refuse chaque demande après vérification du pseudo.",
"Joueur : crée un compte FREE sans code, confirme ton e-mail, saisis exactement pseudo, serveur et tag, puis accepte la synchronisation cloud. Enregistre ton profil, demande l’accès à l’espace et attends l’approbation du propriétaire. Ouvre ensuite le roster partagé ; les données privées des autres alliances restent inaccessibles.",
"Dépannage : aucune demande ? Vérifie le bon espace et actualise les demandes. Pseudo différent ? Corrige le profil et fais vérifier le brouillon par le fondateur. Demande refusée ? Contacte le propriétaire avant une nouvelle demande. Lien e-mail ? Vérifie les indésirables et demande un nouveau lien depuis Compte. Saisie invalide ? Utilise Pseudo ; R3, jamais R3. Roster vide ? Le fondateur doit enregistrer des lignes puis rouvrir le roster.",
"Le fondateur gère seulement son espace WarBoost. Grades déclarés non vérifiés par Last War ; ni PRO ni accès à une autre alliance ne sont accordés. Une approbation explicite reste obligatoire.",
"Roster vide : aucune ligne partagée enregistrée.",
"Brouillon privé enregistré et confirmé par le serveur.",
"Brouillon modifié, pas encore enregistré.",
"Roster partagé chargé et confirmé par le serveur.",
"En attente d’approbation","Approuvée","Refusée",
"Ligne {line} : saisis Pseudo ; R1 à R5, ou seulement le pseudo. Retire le point après R3. La saisie est conservée.",
"Grade déclaré, non vérifié","Aucune demande.","Accès libre sans code",
"Le grade déclaré dans le profil diffère du brouillon. Aucun des deux n’est vérifié."
],
en:[
"Help: account and alliance",
"Founder: enter server and tag, then create or recover your workspace. Enter one nickname per draft line; optional rank: Nickname ; R3 (R1–R5, no full stop). Save, then open workspace membership. Read the shared roster and requests; approve or reject each after checking the nickname.",
"Player: create a FREE account without a code, confirm your email, enter the exact nickname, server and tag, and consent to cloud sync. Save your profile, request workspace access and wait for the owner's approval. Then open the shared roster; other alliances' private data stays inaccessible.",
"Troubleshooting: no request? Check the workspace and refresh requests. Different nickname? Correct the profile and ask the founder to check the draft. Rejected? Contact the owner before requesting again. Email link? Check spam and request a new link from Account. Invalid input? Use Nickname ; R3, not R3. Empty roster? The founder must save rows, then reopen it.",
"The founder only manages their WarBoost workspace. Declared ranks are not verified by Last War; no PRO or other alliance access is granted. Explicit approval remains required.",
"Empty roster: no saved shared rows.","Private draft saved and acknowledged by the server.","Draft changed, not saved yet.","Shared roster loaded and acknowledged by the server.",
"Awaiting approval","Approved","Rejected","Line {line}: enter Nickname ; R1 to R5, or just a nickname. Remove the full stop after R3. Your input is preserved.",
"Declared rank, unverified","No requests.","Free access without a code","The profile rank differs from the draft. Neither is verified."
],
es:[
"Ayuda: cuenta y alianza",
"Fundador: indica servidor y etiqueta y crea o recupera tu espacio. Escribe un apodo por línea; rango opcional: Apodo ; R3 (R1–R5, sin punto). Guarda y abre las solicitudes del espacio. Lee la plantilla compartida y aprueba o rechaza cada solicitud tras comprobar el apodo.",
"Jugador: crea una cuenta FREE sin código, confirma el correo, introduce apodo, servidor y etiqueta exactos y acepta la nube. Guarda el perfil, solicita acceso y espera la aprobación del propietario. Después abre la plantilla; las demás alianzas siguen siendo privadas.",
"Problemas: ¿no hay solicitud? Revisa el espacio y actualiza. ¿Apodo distinto? Corrige el perfil y pide revisar el borrador. ¿Rechazo? Contacta al propietario antes de repetir. ¿Enlace de correo? Revisa spam y pide otro desde Cuenta. Usa Apodo ; R3, no R3. Si está vacío, el fundador debe guardar líneas y volver a abrir.",
"El fundador solo gestiona su espacio WarBoost. Los rangos declarados no están verificados por Last War; no otorgan PRO ni acceso a otra alianza. La aprobación explícita es obligatoria.",
"Plantilla vacía: no hay líneas compartidas guardadas.","Borrador guardado y confirmado por el servidor.","Borrador modificado, aún sin guardar.","Plantilla cargada y confirmada por el servidor.",
"Pendiente de aprobación","Aprobada","Rechazada","Línea {line}: Apodo ; R1 a R5, o solo apodo. Quita el punto de R3. Se conserva el texto.",
"Rango declarado, no verificado","Sin solicitudes.","Acceso libre sin código","El rango del perfil difiere del borrador. Ninguno está verificado."
],
it:[
"Guida: account e alleanza",
"Fondatore: indica server e tag, poi crea o ritrova lo spazio. Scrivi un nome per riga; grado facoltativo: Nome ; R3 (R1–R5, senza punto). Salva e apri le richieste dello spazio. Leggi il roster condiviso e approva o rifiuta dopo aver verificato il nome.",
"Giocatore: crea un account FREE senza codice, conferma l'e-mail, inserisci nome, server e tag esatti e accetta il cloud. Salva il profilo, richiedi accesso e attendi l'approvazione del proprietario. Poi apri il roster; le altre alleanze restano private.",
"Problemi: nessuna richiesta? Controlla lo spazio e aggiorna. Nome diverso? Correggi il profilo e fai controllare la bozza. Rifiuto? Contatta il proprietario prima di riprovare. Link e-mail? Controlla spam e chiedine un altro da Account. Usa Nome ; R3, non R3. Roster vuoto? Il fondatore deve salvare righe e riaprirlo.",
"Il fondatore gestisce solo il proprio spazio WarBoost. I gradi dichiarati non sono verificati da Last War; nessun PRO o accesso ad altre alleanze. Serve approvazione esplicita.",
"Roster vuoto: nessuna riga condivisa salvata.","Bozza salvata e confermata dal server.","Bozza modificata, non ancora salvata.","Roster caricato e confermato dal server.",
"In attesa di approvazione","Approvata","Rifiutata","Riga {line}: Nome ; R1–R5, oppure solo nome. Togli il punto dopo R3. Il testo resta salvaguardato.",
"Grado dichiarato, non verificato","Nessuna richiesta.","Accesso libero senza codice","Il grado del profilo differisce dalla bozza. Nessuno è verificato."
],
de:[
"Hilfe: Konto und Allianz",
"Gründer: Server und Kürzel eingeben, Bereich erstellen oder wiederfinden. Ein Name je Entwurfszeile; Rang optional: Name ; R3 (R1–R5, ohne Punkt). Speichern und Aufnahme öffnen. Gemeinsame Liste und Anfragen lesen; Namen prüfen, dann zustimmen oder ablehnen.",
"Spieler: FREE-Konto ohne Code erstellen, E-Mail bestätigen, Namen, Server und Kürzel genau eingeben und Cloud zustimmen. Profil speichern, Zugang beantragen und Zustimmung des Eigentümers abwarten. Dann Liste öffnen; andere Allianzen bleiben privat.",
"Probleme: keine Anfrage? Bereich prüfen und aktualisieren. Anderer Name? Profil korrigieren und Entwurf prüfen lassen. Abgelehnt? Vor neuer Anfrage Eigentümer kontaktieren. E-Mail-Link? Spam prüfen und unter Konto neu anfordern. Name ; R3 verwenden, nicht R3. Bei leerer Liste muss der Gründer Zeilen speichern und sie erneut öffnen.",
"Der Gründer verwaltet nur seinen WarBoost-Bereich. Angegebene Ränge sind nicht von Last War bestätigt; kein PRO und kein Fremdzugriff. Ausdrückliche Zustimmung bleibt erforderlich.",
"Liste leer: keine geteilten Zeilen gespeichert.","Entwurf gespeichert und vom Server bestätigt.","Entwurf geändert, noch nicht gespeichert.","Liste geladen und vom Server bestätigt.",
"Wartet auf Zustimmung","Genehmigt","Abgelehnt","Zeile {line}: Name ; R1–R5 oder nur Name. Punkt nach R3 entfernen. Eingabe bleibt erhalten.",
"Angegebener Rang, unbestätigt","Keine Anfragen.","Freier Zugang ohne Code","Profilrang und Entwurf weichen ab. Beide sind unbestätigt."
],
pt:[
"Ajuda: conta e aliança",
"Fundador: indica servidor e tag e cria ou recupera o espaço. Um nome por linha; patente opcional: Nome ; R3 (R1–R5, sem ponto). Guarda e abre a admissão. Lê a lista partilhada e os pedidos; confirma o nome antes de aprovar ou recusar.",
"Jogador: cria conta FREE sem código, confirma o e-mail, indica nome, servidor e tag exatos e aceita a nuvem. Guarda o perfil, pede acesso e aguarda aprovação do proprietário. Depois abre a lista; outras alianças permanecem privadas.",
"Problemas: sem pedido? Verifica o espaço e atualiza. Nome diferente? Corrige o perfil e pede revisão do rascunho. Recusado? Contacta o proprietário antes de repetir. Ligação de e-mail? Vê spam e pede outra em Conta. Usa Nome ; R3, não R3. Lista vazia? O fundador deve guardar linhas e reabrir.",
"O fundador gere só o seu espaço WarBoost. Patentes declaradas não são verificadas por Last War; não dão PRO nem acesso a outra aliança. Aprovação explícita obrigatória.",
"Lista vazia: sem linhas partilhadas guardadas.","Rascunho guardado e confirmado pelo servidor.","Rascunho alterado, ainda não guardado.","Lista carregada e confirmada pelo servidor.",
"A aguardar aprovação","Aprovado","Recusado","Linha {line}: Nome ; R1–R5 ou só nome. Retira o ponto após R3. O texto é preservado.",
"Patente declarada, não verificada","Sem pedidos.","Acesso livre sem código","A patente do perfil difere do rascunho. Nenhuma está verificada."
],
nl:[
"Hulp: account en alliantie",
"Oprichter: vul server en tag in en maak of herstel je ruimte. Eén naam per conceptregel; rang optioneel: Naam ; R3 (R1–R5, zonder punt). Sla op en open de toelating. Lees de gedeelde lijst en controleer namen voordat je aanvragen goedkeurt of afwijst.",
"Speler: maak een FREE-account zonder code, bevestig je e-mail, vul exacte naam, server en tag in en stem in met cloudopslag. Sla je profiel op, vraag toegang en wacht op de eigenaar. Open daarna de lijst; andere allianties blijven privé.",
"Problemen: geen aanvraag? Controleer ruimte en vernieuw. Andere naam? Pas profiel aan en laat het concept nakijken. Afgewezen? Neem eerst contact op met de eigenaar. E-maillink? Controleer spam en vraag een nieuwe via Account. Gebruik Naam ; R3, niet R3. Lege lijst? De oprichter moet regels opslaan en heropenen.",
"De oprichter beheert alleen de eigen WarBoost-ruimte. Opgegeven rangen zijn niet door Last War bevestigd; geen PRO of toegang tot andere allianties. Expliciete goedkeuring blijft nodig.",
"Lege lijst: geen gedeelde regels opgeslagen.","Concept opgeslagen en bevestigd door de server.","Concept gewijzigd, nog niet opgeslagen.","Lijst geladen en bevestigd door de server.",
"Wacht op goedkeuring","Goedgekeurd","Afgewezen","Regel {line}: Naam ; R1–R5 of alleen naam. Verwijder de punt na R3. Invoer blijft behouden.",
"Opgegeven rang, onbevestigd","Geen aanvragen.","Vrije toegang zonder code","De profielrang wijkt af van het concept. Geen van beide is bevestigd."
],
zh:[
"帮助：账号与联盟",
"创始人：填写服务器和联盟标签，创建或找回空间。草稿每行一个昵称；可选军阶：昵称 ; R3（R1至R5，不加句号）。保存后开放空间申请。查看共享名单与申请，核对昵称后逐一批准或拒绝。",
"玩家：无需代码注册FREE账号，验证邮箱，准确填写昵称、服务器和标签并同意云同步。保存资料后申请加入，等待所有者批准。批准后打开共享名单；不能访问其他联盟的私有数据。",
"排查：没有申请？核对空间并刷新。昵称不符？更正资料并让创始人检查草稿。被拒绝？再次申请前联系所有者。邮件链接问题？检查垃圾邮件，在账号页重新申请。格式应为昵称 ; R3，不是R3.。名单为空？创始人须先保存名单再打开。",
"创始人仅管理自己的WarBoost空间。所填军阶未经Last War验证；不授予PRO或其他联盟权限。必须明确批准。",
"名单为空：尚无已保存的共享行。","私人草稿已保存并获服务器确认。","草稿已修改，尚未保存。","共享名单已加载并获服务器确认。",
"等待批准","已批准","已拒绝","第{line}行：填写昵称 ; R1至R5，或仅昵称。删除R3后的句点。输入保留。",
"声明军阶，未经验证","暂无申请。","无需代码，自由访问","资料军阶与草稿不同，两者均未验证。"
],
ja:[
"ヘルプ：アカウントと同盟",
"設立者：サーバーとタグを入力し、スペースを作成または再表示します。下書きは1行1名、階級は任意：名前 ; R3（R1～R5、末尾の点なし）。保存後に参加受付を開き、共有名簿と申請を確認して名前を照合し、承認または拒否します。",
"プレイヤー：コード不要でFREE登録し、メールを確認、正確な名前・サーバー・タグを入力しクラウドに同意します。プロフィールを保存して参加申請し、所有者の承認後に共有名簿を開きます。他の同盟の非公開データは見られません。",
"問題時：申請なしならスペースを確認して更新。名前違いならプロフィールと下書きを修正。拒否なら再申請前に所有者へ連絡。メールリンクは迷惑メールを確認しアカウントから再送依頼。名前 ; R3を使いR3.は不可。名簿が空なら設立者が保存後に開き直します。",
"設立者は自分のWarBoostスペースだけを管理します。申告階級はLast War未確認で、PROや他同盟の権限を与えません。明示的な承認が必要です。",
"名簿は空です。保存済み共有行はありません。","下書きを保存しサーバーが確認しました。","下書きは変更済みで未保存です。","共有名簿を読み込みサーバーが確認しました。",
"承認待ち","承認済み","拒否済み","{line}行目：名前 ; R1～R5、または名前のみ。R3の後の点を削除。入力は保持されます。",
"申告階級・未確認","申請はありません。","コード不要の自由アクセス","プロフィールと下書きの階級が異なります。どちらも未確認です。"
],
ru:[
"Помощь: аккаунт и альянс",
"Основатель: укажите сервер и тег, создайте или найдите пространство. По одному имени на строку; ранг необязателен: Имя ; R3 (R1–R5, без точки). Сохраните и откройте приём. Проверьте общий список и имена в заявках, затем одобрите или отклоните.",
"Игрок: создайте FREE-аккаунт без кода, подтвердите почту, точно укажите имя, сервер и тег и разрешите облако. Сохраните профиль, запросите доступ и ждите одобрения владельца. Затем откройте список; чужие альянсы недоступны.",
"Проблемы: нет заявки? Проверьте пространство и обновите. Другое имя? Исправьте профиль и попросите проверить черновик. Отказ? Сначала свяжитесь с владельцем. Ссылка почты? Проверьте спам и запросите новую в аккаунте. Формат Имя ; R3, не R3. Пустой список? Основатель должен сохранить строки и открыть снова.",
"Основатель управляет только своим пространством WarBoost. Заявленные ранги не проверены Last War, не дают PRO или чужой доступ. Требуется явное одобрение.",
"Список пуст: сохранённых общих строк нет.","Черновик сохранён и подтверждён сервером.","Черновик изменён, ещё не сохранён.","Список загружен и подтверждён сервером.",
"Ожидает одобрения","Одобрено","Отклонено","Строка {line}: Имя ; R1–R5 или только имя. Уберите точку после R3. Ввод сохранён.",
"Заявленный ранг, не проверен","Заявок нет.","Свободный доступ без кода","Ранг профиля отличается от черновика. Оба не проверены."
],
ar:[
"مساعدة: الحساب والتحالف",
"المؤسس: أدخل الخادم ووسم التحالف ثم أنشئ مساحتك أو استرجعها. اكتب اسماً في كل سطر؛ الرتبة اختيارية: اسم ; R3 من R1 إلى R5 بلا نقطة. احفظ ثم افتح استقبال الطلبات. اقرأ القائمة المشتركة وتحقق من الاسم قبل قبول كل طلب أو رفضه.",
"اللاعب: أنشئ حساب FREE بلا رمز، وأكد بريدك وأدخل الاسم والخادم والوسم بدقة ووافق على المزامنة السحابية. احفظ الملف واطلب الوصول وانتظر موافقة المالك. افتح القائمة بعدها؛ بيانات التحالفات الأخرى تبقى خاصة.",
"حل المشكلات: لا طلب؟ تحقق من المساحة وحدّث الطلبات. اسم مختلف؟ صحح الملف واطلب مراجعة المسودة. رفض؟ اتصل بالمالك قبل طلب جديد. رابط البريد؟ افحص الرسائل المزعجة واطلب رابطاً جديداً من الحساب. استخدم اسم ; R3 وليس R3. القائمة فارغة؟ على المؤسس حفظ السطور ثم فتحها مجدداً.",
"المؤسس يدير مساحته في WarBoost فقط. الرتب المعلنة غير موثقة من Last War ولا تمنح PRO أو وصولاً لتحالف آخر. الموافقة الصريحة مطلوبة.",
"القائمة فارغة: لا سطور مشتركة محفوظة.","تم حفظ المسودة الخاصة وتأكيدها من الخادم.","المسودة معدلة ولم تحفظ بعد.","تم تحميل القائمة وتأكيدها من الخادم.",
"بانتظار الموافقة","مقبول","مرفوض","السطر {line}: اسم ; R1 إلى R5 أو اسم فقط. احذف النقطة بعد R3. النص محفوظ.",
"رتبة معلنة غير موثقة","لا طلبات.","دخول حر بلا رمز","رتبة الملف تختلف عن المسودة. كلتاهما غير موثقة."
],
pl:[
"Pomoc: konto i sojusz",
"Założyciel: podaj serwer i tag, utwórz lub odszukaj przestrzeń. Jeden pseudonim w wierszu; opcjonalna ranga: Nazwa ; R3 (R1–R5, bez kropki). Zapisz i otwórz przyjmowanie. Sprawdź wspólną listę i nazwy przed zatwierdzeniem lub odrzuceniem wniosków.",
"Gracz: utwórz FREE bez kodu, potwierdź e-mail, wpisz dokładny pseudonim, serwer i tag oraz zgódź się na chmurę. Zapisz profil, poproś o dostęp i czekaj na właściciela. Potem otwórz listę; inne sojusze pozostają prywatne.",
"Problemy: brak wniosku? Sprawdź przestrzeń i odśwież. Inna nazwa? Popraw profil i poproś o sprawdzenie szkicu. Odmowa? Najpierw skontaktuj się z właścicielem. Link? Sprawdź spam i poproś o nowy w Koncie. Użyj Nazwa ; R3, nie R3. Pusta lista? Założyciel musi zapisać wiersze i otworzyć ponownie.",
"Założyciel zarządza tylko własną przestrzenią WarBoost. Rangi nie są zweryfikowane przez Last War i nie dają PRO ani obcego dostępu. Wymagana jest wyraźna zgoda.",
"Lista pusta: brak zapisanych wspólnych wierszy.","Szkic zapisany i potwierdzony przez serwer.","Szkic zmieniony, jeszcze niezapisany.","Lista wczytana i potwierdzona przez serwer.",
"Czeka na zatwierdzenie","Zatwierdzony","Odrzucony","Wiersz {line}: Nazwa ; R1–R5 lub sama nazwa. Usuń kropkę po R3. Tekst pozostaje.",
"Ranga deklarowana, niezweryfikowana","Brak wniosków.","Wolny dostęp bez kodu","Ranga profilu różni się od szkicu. Obie są niezweryfikowane."
],
tr:[
"Yardım: hesap ve ittifak",
"Kurucu: sunucu ve etiketi girip alanı oluştur veya bul. Taslakta her satıra bir ad; isteğe bağlı rütbe: Ad ; R3 (R1–R5, noktasız). Kaydet ve başvuruları aç. Ortak listeyi oku, adları kontrol edip başvuruları onayla veya reddet.",
"Oyuncu: kodsuz FREE hesabı aç, e-postayı doğrula, tam ad, sunucu ve etiketi yazıp buluta izin ver. Profili kaydet, erişim iste ve sahibin onayını bekle. Sonra listeyi aç; diğer ittifaklar gizli kalır.",
"Sorun: başvuru yok mu? Alanı kontrol edip yenile. Ad farklı mı? Profili düzelt ve taslağı kontrol ettir. Ret mi? Tekrar istemeden önce sahiple görüş. E-posta bağlantısı? İstenmeyenlere bak, Hesap'tan yeni bağlantı iste. Ad ; R3 kullan, R3. değil. Boş liste? Kurucu satırları kaydedip yeniden açmalı.",
"Kurucu yalnız kendi WarBoost alanını yönetir. Beyan edilen rütbeler Last War tarafından doğrulanmaz; PRO veya başka ittifaka erişim vermez. Açık onay gerekir.",
"Liste boş: kayıtlı ortak satır yok.","Özel taslak kaydedildi, sunucu doğruladı.","Taslak değişti, henüz kaydedilmedi.","Liste yüklendi, sunucu doğruladı.",
"Onay bekliyor","Onaylandı","Reddedildi","Satır {line}: Ad ; R1–R5 veya yalnız ad. R3 sonrası noktayı sil. Metin korunur.",
"Beyan edilen rütbe, doğrulanmadı","Başvuru yok.","Kodsuz serbest erişim","Profil rütbesi taslaktan farklı. İkisi de doğrulanmadı."
],
ko:[
"도움말: 계정과 연맹",
"설립자: 서버와 태그를 입력하고 공간을 만들거나 찾으세요. 초안은 줄마다 닉네임 하나, 계급은 선택: 닉네임 ; R3 (R1~R5, 마침표 없음). 저장하고 가입 접수를 여세요. 공유 명단과 신청의 이름을 확인한 후 승인 또는 거절하세요.",
"플레이어: 코드 없이 FREE 가입, 이메일 인증 후 정확한 닉네임·서버·태그를 입력하고 클라우드에 동의하세요. 프로필 저장 후 접근을 신청하고 소유자 승인을 기다리세요. 이후 공유 명단을 여세요. 다른 연맹 정보는 비공개입니다.",
"문제 해결: 신청이 없으면 공간을 확인하고 새로 고침. 이름이 다르면 프로필과 초안을 확인. 거절되면 재신청 전 소유자에게 문의. 이메일 링크는 스팸함 확인 후 계정에서 재요청. 닉네임 ; R3 형식이며 R3.은 안 됩니다. 빈 명단은 설립자가 줄을 저장한 뒤 다시 열어야 합니다.",
"설립자는 자기 WarBoost 공간만 관리합니다. 신고 계급은 Last War 인증이 아니며 PRO나 타 연맹 접근권이 아닙니다. 명시적 승인이 필요합니다.",
"명단이 비었습니다. 저장된 공유 항목이 없습니다.","초안이 저장되어 서버에서 확인됐습니다.","초안 변경됨, 아직 저장하지 않았습니다.","명단을 불러와 서버에서 확인됐습니다.",
"승인 대기","승인됨","거절됨","{line}행: 닉네임 ; R1~R5 또는 닉네임만 입력. R3 뒤 마침표를 지우세요. 입력은 유지됩니다.",
"신고 계급, 미인증","신청 없음.","코드 없는 자유 접근","프로필과 초안의 계급이 다릅니다. 둘 다 미인증입니다."
],
vi:[
"Trợ giúp: tài khoản và liên minh",
"Người sáng lập: nhập máy chủ và thẻ, tạo hoặc tìm lại không gian. Mỗi dòng một tên; cấp tùy chọn: Tên ; R3 (R1–R5, không dấu chấm). Lưu rồi mở nhận yêu cầu. Đọc danh sách chung, kiểm tra tên trước khi duyệt hoặc từ chối.",
"Người chơi: tạo FREE không mã, xác nhận email, nhập đúng tên, máy chủ, thẻ và đồng ý đám mây. Lưu hồ sơ, xin truy cập và chờ chủ sở hữu duyệt. Sau đó mở danh sách; liên minh khác vẫn riêng tư.",
"Khắc phục: không có yêu cầu? Kiểm tra không gian và làm mới. Sai tên? Sửa hồ sơ, nhờ kiểm tra bản nháp. Bị từ chối? Liên hệ chủ trước khi gửi lại. Liên kết email? Xem thư rác và xin lại trong Tài khoản. Dùng Tên ; R3, không R3. Danh sách trống? Người sáng lập phải lưu các dòng rồi mở lại.",
"Người sáng lập chỉ quản lý không gian WarBoost của mình. Cấp tự khai chưa được Last War xác minh, không cấp PRO hay quyền liên minh khác. Phải duyệt rõ ràng.",
"Danh sách trống: chưa có dòng chung đã lưu.","Bản nháp đã lưu và máy chủ xác nhận.","Bản nháp đã đổi, chưa lưu.","Danh sách đã tải và máy chủ xác nhận.",
"Chờ phê duyệt","Đã duyệt","Đã từ chối","Dòng {line}: Tên ; R1–R5 hoặc chỉ tên. Xóa dấu chấm sau R3. Giữ nguyên nội dung.",
"Cấp tự khai, chưa xác minh","Không có yêu cầu.","Truy cập tự do không mã","Cấp trong hồ sơ khác bản nháp. Cả hai chưa xác minh."
],
th:[
"วิธีใช้: บัญชีและพันธมิตร",
"ผู้ก่อตั้ง: ใส่เซิร์ฟเวอร์และแท็ก แล้วสร้างหรือค้นพื้นที่เดิม ร่างหนึ่งชื่อต่อบรรทัด ระบุยศได้: ชื่อ ; R3 (R1–R5 ไม่มีจุด) บันทึกแล้วเปิดรับคำขอ อ่านรายชื่อร่วมและตรวจชื่อก่อนอนุมัติหรือปฏิเสธ",
"ผู้เล่น: สมัคร FREE ไม่ใช้รหัส ยืนยันอีเมล กรอกชื่อ เซิร์ฟเวอร์ แท็กให้ตรง และยินยอมใช้คลาวด์ บันทึกโปรไฟล์ ขอเข้าพื้นที่และรอเจ้าของอนุมัติ แล้วเปิดรายชื่อร่วม ข้อมูลพันธมิตรอื่นยังเป็นส่วนตัว",
"แก้ปัญหา: ไม่มีคำขอให้ตรวจพื้นที่และรีเฟรช ชื่อต่างให้แก้โปรไฟล์และตรวจร่าง ถูกปฏิเสธให้ติดต่อเจ้าของก่อนขอใหม่ ลิงก์อีเมลให้ดูสแปมและขอใหม่ในบัญชี ใช้ ชื่อ ; R3 ไม่ใช่ R3. รายชื่อว่างให้ผู้ก่อตั้งบันทึกบรรทัดแล้วเปิดใหม่",
"ผู้ก่อตั้งจัดการเฉพาะพื้นที่ WarBoost ของตน ยศที่แจ้งไม่ได้ยืนยันโดย Last War ไม่ให้ PRO หรือสิทธิ์พันธมิตรอื่น ต้องอนุมัติอย่างชัดเจน",
"รายชื่อว่าง ยังไม่มีบรรทัดร่วมที่บันทึก","บันทึกร่างและเซิร์ฟเวอร์ยืนยันแล้ว","ร่างเปลี่ยนแล้ว ยังไม่บันทึก","โหลดรายชื่อและเซิร์ฟเวอร์ยืนยันแล้ว",
"รออนุมัติ","อนุมัติแล้ว","ปฏิเสธแล้ว","บรรทัด {line}: ชื่อ ; R1–R5 หรือชื่ออย่างเดียว ลบจุดหลัง R3 ข้อความยังอยู่",
"ยศที่แจ้ง ยังไม่ยืนยัน","ไม่มีคำขอ","เข้าใช้เสรีไม่ใช้รหัส","ยศโปรไฟล์ต่างจากร่าง ทั้งคู่ยังไม่ยืนยัน"
],
id:[
"Bantuan: akun dan aliansi",
"Pendiri: isi server dan tag lalu buat atau temukan ruang. Satu nama per baris draf; pangkat opsional: Nama ; R3 (R1–R5, tanpa titik). Simpan lalu buka penerimaan. Baca daftar bersama dan periksa nama sebelum menyetujui atau menolak.",
"Pemain: buat akun FREE tanpa kode, konfirmasi email, isi nama, server, tag persis dan setujui cloud. Simpan profil, minta akses dan tunggu persetujuan pemilik. Lalu buka daftar; aliansi lain tetap privat.",
"Masalah: tak ada permintaan? Periksa ruang dan muat ulang. Nama berbeda? Perbaiki profil dan periksa draf. Ditolak? Hubungi pemilik sebelum meminta lagi. Tautan email? Periksa spam dan minta baru dari Akun. Gunakan Nama ; R3, bukan R3. Daftar kosong? Pendiri harus menyimpan baris lalu membuka lagi.",
"Pendiri hanya mengelola ruang WarBoost miliknya. Pangkat pernyataan belum diverifikasi Last War; bukan PRO atau akses aliansi lain. Persetujuan tegas diperlukan.",
"Daftar kosong: belum ada baris bersama tersimpan.","Draf disimpan dan dikonfirmasi server.","Draf berubah, belum disimpan.","Daftar dimuat dan dikonfirmasi server.",
"Menunggu persetujuan","Disetujui","Ditolak","Baris {line}: Nama ; R1–R5 atau nama saja. Hapus titik setelah R3. Teks tetap ada.",
"Pangkat pernyataan, belum diverifikasi","Tidak ada permintaan.","Akses bebas tanpa kode","Pangkat profil berbeda dari draf. Keduanya belum diverifikasi."
],
uk:[
"Допомога: обліковий запис і альянс",
"Засновник: введіть сервер і тег, створіть або знайдіть простір. Одне ім’я на рядок; ранг необов’язковий: Ім’я ; R3 (R1–R5, без крапки). Збережіть і відкрийте прийом. Перевірте спільний список та імена перед схваленням або відмовою.",
"Гравець: створіть FREE без коду, підтвердьте пошту, точно введіть ім’я, сервер і тег та погодьте хмару. Збережіть профіль, подайте запит і чекайте схвалення власника. Потім відкрийте список; інші альянси залишаються приватними.",
"Проблеми: немає запиту? Перевірте простір і оновіть. Інше ім’я? Виправте профіль і перевірте чернетку. Відмова? Спочатку зверніться до власника. Посилання пошти? Перевірте спам і замовте нове в Обліковому записі. Формат Ім’я ; R3, не R3. Порожній список? Засновник має зберегти рядки й відкрити знову.",
"Засновник керує лише своїм простором WarBoost. Заявлені ранги не перевірені Last War, не дають PRO чи доступу до інших альянсів. Потрібне явне схвалення.",
"Список порожній: спільних збережених рядків немає.","Чернетку збережено й підтверджено сервером.","Чернетку змінено, ще не збережено.","Список завантажено й підтверджено сервером.",
"Очікує схвалення","Схвалено","Відхилено","Рядок {line}: Ім’я ; R1–R5 або лише ім’я. Видаліть крапку після R3. Введене збережено.",
"Заявлений ранг, не перевірений","Запитів немає.","Вільний доступ без коду","Ранг профілю відрізняється від чернетки. Обидва не перевірені."
],
ro:[
"Ajutor: cont și alianță",
"Fondator: introdu serverul și eticheta, creează sau regăsește spațiul. Un nume pe rând; rang opțional: Nume ; R3 (R1–R5, fără punct). Salvează și deschide primirea. Citește lista comună și verifică numele înainte de aprobare sau refuz.",
"Jucător: creează FREE fără cod, confirmă e-mailul, introdu exact numele, serverul și eticheta și acceptă cloudul. Salvează profilul, cere acces și așteaptă aprobarea proprietarului. Apoi deschide lista; alte alianțe rămân private.",
"Probleme: nicio cerere? Verifică spațiul și actualizează. Alt nume? Corectează profilul și verifică schița. Refuz? Contactează proprietarul înainte de a cere iar. Link e-mail? Verifică spam și cere altul din Cont. Folosește Nume ; R3, nu R3. Listă goală? Fondatorul salvează rândurile și redeschide.",
"Fondatorul gestionează doar propriul spațiu WarBoost. Rangurile declarate nu sunt verificate de Last War, nu acordă PRO ori acces la alte alianțe. Aprobarea explicită este necesară.",
"Listă goală: nu există rânduri comune salvate.","Schiță salvată și confirmată de server.","Schiță modificată, încă nesalvată.","Listă încărcată și confirmată de server.",
"Așteaptă aprobarea","Aprobată","Refuzată","Rând {line}: Nume ; R1–R5 sau doar nume. Elimină punctul după R3. Textul se păstrează.",
"Rang declarat, neverificat","Nicio cerere.","Acces liber fără cod","Rangul profilului diferă de schiță. Niciunul nu este verificat."
],
el:[
"Βοήθεια: λογαριασμός και συμμαχία",
"Ιδρυτής: βάλε διακομιστή και ετικέτα, δημιούργησε ή βρες τον χώρο. Ένα όνομα ανά γραμμή· προαιρετικός βαθμός: Όνομα ; R3 (R1–R5, χωρίς τελεία). Αποθήκευσε και άνοιξε αιτήσεις. Έλεγξε κοινή λίστα και ονόματα πριν εγκρίνεις ή απορρίψεις.",
"Παίκτης: δημιούργησε FREE χωρίς κωδικό, επιβεβαίωσε email, βάλε ακριβές όνομα, διακομιστή και ετικέτα και δέξου το cloud. Αποθήκευσε προφίλ, ζήτησε πρόσβαση και περίμενε έγκριση ιδιοκτήτη. Μετά άνοιξε τη λίστα· άλλες συμμαχίες παραμένουν ιδιωτικές.",
"Προβλήματα: καμία αίτηση; Έλεγξε χώρο και ανανέωσε. Άλλο όνομα; Διόρθωσε προφίλ και έλεγξε πρόχειρο. Απόρριψη; Μίλησε με ιδιοκτήτη πριν ξαναζητήσεις. Σύνδεσμος email; Δες ανεπιθύμητα και ζήτησε νέο από Λογαριασμό. Χρησιμοποίησε Όνομα ; R3, όχι R3. Κενή λίστα; Ο ιδρυτής αποθηκεύει γραμμές και ανοίγει ξανά.",
"Ο ιδρυτής διαχειρίζεται μόνο τον δικό του χώρο WarBoost. Δηλωμένοι βαθμοί δεν επαληθεύονται από Last War, δεν δίνουν PRO ή ξένη πρόσβαση. Απαιτείται ρητή έγκριση.",
"Κενή λίστα: χωρίς αποθηκευμένες κοινές γραμμές.","Το πρόχειρο αποθηκεύτηκε και επιβεβαιώθηκε από τον διακομιστή.","Το πρόχειρο άλλαξε, δεν αποθηκεύτηκε ακόμη.","Η λίστα φορτώθηκε και επιβεβαιώθηκε από τον διακομιστή.",
"Αναμονή έγκρισης","Εγκρίθηκε","Απορρίφθηκε","Γραμμή {line}: Όνομα ; R1–R5 ή μόνο όνομα. Αφαίρεσε την τελεία μετά το R3. Το κείμενο διατηρείται.",
"Δηλωμένος βαθμός, ανεπιβεβαίωτος","Καμία αίτηση.","Ελεύθερη πρόσβαση χωρίς κωδικό","Ο βαθμός προφίλ διαφέρει από το πρόχειρο. Κανένας δεν επαληθεύτηκε."
],
cs:[
"Nápověda: účet a aliance",
"Zakladatel: vyplň server a značku, vytvoř nebo najdi prostor. Jedno jméno na řádek; hodnost volitelná: Jméno ; R3 (R1–R5, bez tečky). Ulož a otevři příjem. Zkontroluj společný seznam a jména před schválením či odmítnutím.",
"Hráč: vytvoř FREE bez kódu, potvrď e-mail, zadej přesné jméno, server a značku a odsouhlas cloud. Ulož profil, požádej o přístup a čekej na vlastníka. Potom otevři seznam; ostatní aliance zůstávají soukromé.",
"Potíže: žádost chybí? Ověř prostor a obnov. Jiné jméno? Oprav profil a nech ověřit návrh. Odmítnuto? Nejdřív kontaktuj vlastníka. Odkaz e-mailu? Zkontroluj spam a vyžádej nový v Účtu. Použij Jméno ; R3, ne R3. Prázdný seznam? Zakladatel musí uložit řádky a znovu otevřít.",
"Zakladatel spravuje jen svůj prostor WarBoost. Deklarované hodnosti Last War neověřil, nedávají PRO ani cizí přístup. Je nutný výslovný souhlas.",
"Seznam prázdný: žádné uložené společné řádky.","Návrh uložen a potvrzen serverem.","Návrh změněn, dosud neuložen.","Seznam načten a potvrzen serverem.",
"Čeká na schválení","Schváleno","Odmítnuto","Řádek {line}: Jméno ; R1–R5 nebo jen jméno. Odstraň tečku za R3. Text zůstane.",
"Deklarovaná hodnost, neověřena","Žádné žádosti.","Volný přístup bez kódu","Hodnost profilu se liší od návrhu. Ani jedna není ověřena."
],
sv:[
"Hjälp: konto och allians",
"Grundare: ange server och tagg, skapa eller hitta utrymmet. Ett namn per rad; valfri rang: Namn ; R3 (R1–R5, utan punkt). Spara och öppna ansökningar. Läs gemensam lista och kontrollera namn före godkännande eller avslag.",
"Spelare: skapa FREE utan kod, bekräfta e-post, ange exakt namn, server och tagg och godkänn molnet. Spara profilen, begär åtkomst och vänta på ägaren. Öppna sedan listan; andra allianser förblir privata.",
"Problem: ingen ansökan? Kontrollera utrymmet och uppdatera. Annat namn? Rätta profilen och kontrollera utkastet. Avslag? Kontakta ägaren före ny ansökan. E-postlänk? Kontrollera skräppost och begär ny från Konto. Använd Namn ; R3, inte R3. Tom lista? Grundaren måste spara rader och öppna igen.",
"Grundaren hanterar endast sitt WarBoost-utrymme. Angivna grader är inte verifierade av Last War, ger inte PRO eller annan alliansåtkomst. Uttryckligt godkännande krävs.",
"Tom lista: inga sparade gemensamma rader.","Utkast sparat och bekräftat av servern.","Utkast ändrat, ännu inte sparat.","Lista hämtad och bekräftad av servern.",
"Väntar på godkännande","Godkänd","Avslagen","Rad {line}: Namn ; R1–R5 eller bara namn. Ta bort punkten efter R3. Texten bevaras.",
"Angiven rang, overifierad","Inga ansökningar.","Fri åtkomst utan kod","Profilens rang skiljer sig från utkastet. Ingen är verifierad."
]
};
export const WORKSPACE_HELP_LANGUAGES=Object.freeze(Object.keys(rows));
export function workspaceHelpCopy(locale="en"){
  const language=String(locale).toLowerCase().split(/[-_]/)[0];
  return Object.fromEntries(keys.map((key,i)=>[key,(rows[language]||rows.en)[i]]));
}
export function renderWorkspaceHelp(container,locale){
  const copy=workspaceHelpCopy(locale);
  container.lang=String(locale);container.dir=/^ar(?:-|$)/i.test(locale)?"rtl":"ltr";
  const summary=container.ownerDocument.createElement("summary");summary.textContent=copy.title;
  const paragraphs=["founder","member","trouble","security"].map(key=>{
    const p=container.ownerDocument.createElement("p");p.textContent=copy[key];return p;
  });
  container.replaceChildren(summary,...paragraphs);
}
