const COPY={
  fr:{
    intro:"Choisis une capture à garder sur cet appareil. Aucun scan serveur n’est activé. Le prototype OCR local est limité aux formations et au Centre Technologie; il ne sauvegarde rien.",
    title:"Lecture locale gratuite · prototype",
    help:"Choisis une capture de formation ou du Centre Technologie. Environ 15 Mo de ressources OCR sont chargés depuis WarBoost au premier usage. La capture est lue en mémoire sur cet appareil; aucun résultat n’est enregistré, appliqué ou envoyé. La saisie manuelle reste disponible.",
    serverUnavailable:"Aucun scan automatique côté serveur n’est activé. Le prototype OCR local est limité aux formations et au Centre Technologie.",
    language:"Langue visible dans le jeu",
    english:"Anglais",
    french:"Français",
    start:"Tester la lecture locale (gratuit)",
    cancel:"Annuler la lecture",
    choose:"Choisis une seule capture de formation ou de technologie.",
    processing:"Lecture locale en cours…",
    text:"Texte reconnu",
    proposals:"Candidats à vérifier",
    noText:"Aucun texte suffisamment lisible n’a été reconnu. Aucune proposition n’est faite.",
    noProposals:"Aucun champ non ambigu à proposer.",
    readOnly:"Résultat de brouillon seulement : rien n’est confirmé, enregistré ou synchronisé.",
    unavailable:"La lecture locale nécessite un navigateur compatible avec WebAssembly et Web Worker.",
    error:"La lecture locale a échoué. La capture et les données WarBoost n’ont pas été modifiées.",
    timeout:"La lecture locale a dépassé le délai. Tu peux annuler ou réessayer.",
    cancelled:"Lecture annulée; aucun résultat n’a été enregistré.",
    login:"Connecte-toi avec le compte propriétaire avant de lire une capture.",
    confidence:"confiance",
    candidatePower:"Puissance d’escouade candidate",
    candidateTechnology:"Technologie candidate",
    candidateState:"État visible"
  },
  en:{
    intro:"Choose a screenshot to keep on this device. No server scan is enabled. The local OCR prototype is limited to formations and the Technology Center; it does not save results.",
    title:"Free on-device text reading · prototype",
    help:"Choose a formation or Technology Center screenshot. About 15 MB of OCR assets are loaded from WarBoost on first use. The screenshot is read in memory on this device; no result is saved, applied, or sent. Manual entry remains available.",
    serverUnavailable:"No server-side automatic scan is enabled. The local OCR prototype is limited to formations and the Technology Center.",
    language:"Language visible in the game",
    english:"English",
    french:"French",
    start:"Try local reading (free)",
    cancel:"Cancel reading",
    choose:"Choose one formation or technology screenshot.",
    processing:"Reading locally…",
    text:"Recognized text",
    proposals:"Candidates to review",
    noText:"No sufficiently readable text was recognized. No candidate is suggested.",
    noProposals:"No unambiguous field candidate was found.",
    readOnly:"Draft result only: nothing is confirmed, saved, or synchronized.",
    unavailable:"Local reading requires a browser with WebAssembly and Web Worker support.",
    error:"Local reading failed. The screenshot and WarBoost data were not changed.",
    timeout:"Local reading timed out. You can cancel or try again.",
    cancelled:"Reading cancelled; no result was saved.",
    login:"Sign in with the owning account before reading a screenshot.",
    confidence:"confidence",
    candidatePower:"Squad power candidate",
    candidateTechnology:"Technology candidate",
    candidateState:"Visible state"
  }
};

export function localScanOcrCopy(language){
  const code=String(language||"").toLowerCase();
  return code.startsWith("fr")?COPY.fr:COPY.en;
}
