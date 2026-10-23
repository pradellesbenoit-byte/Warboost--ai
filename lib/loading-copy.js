// 22 languages + US/UK English locale variants; no gameplay data.
const rows={
fr:["Mise à jour de l’alliance en cours…","Alliance mise à jour"],
"en-GB":["Updating the alliance…","Alliance updated"],
"en-US":["Updating the alliance…","Alliance updated"],
de:["Allianz wird aktualisiert…","Allianz aktualisiert"],
es:["Actualizando la alianza…","Alianza actualizada"],
it:["Aggiornamento dell’alleanza…","Alleanza aggiornata"],
pt:["A atualizar a aliança…","Aliança atualizada"],
pl:["Aktualizowanie sojuszu…","Sojusz zaktualizowany"],
tr:["İttifak güncelleniyor…","İttifak güncellendi"],
ru:["Обновление альянса…","Альянс обновлён"],
uk:["Оновлення альянсу…","Альянс оновлено"],
ar:["جارٍ تحديث التحالف…","تم تحديث التحالف"],
ja:["同盟を更新中…","同盟を更新しました"],
ko:["동맹 업데이트 중…","동맹 업데이트 완료"],
zh:["正在更新联盟…","联盟已更新"],
ro:["Se actualizează alianța…","Alianță actualizată"],
el:["Ενημέρωση συμμαχίας…","Η συμμαχία ενημερώθηκε"],
cs:["Aktualizace aliance…","Aliance aktualizována"],
id:["Memperbarui aliansi…","Aliansi diperbarui"],
th:["กำลังอัปเดตพันธมิตร…","อัปเดตพันธมิตรแล้ว"],
vi:["Đang cập nhật liên minh…","Đã cập nhật liên minh"],
nl:["Alliantie bijwerken…","Alliantie bijgewerkt"],
sv:["Uppdaterar alliansen…","Alliansen uppdaterad"],
};
export const LOADING_TRANSLATIONS=Object.fromEntries(Object.entries(rows).map(([code,copy])=>
  [code,{alliance_update_busy:copy[0],alliance_update_done:copy[1]}]));
