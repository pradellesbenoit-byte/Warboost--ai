// Account access is not an alliance role, an invitation or a PRO entitlement.
export function freeAccountAllowed(user){
  return Boolean(user?.id&&user?.email&&typeof user?.email_confirmed_at==="string"&&Number.isFinite(Date.parse(user.email_confirmed_at)));
}
export function assertFreeAccount(user){
  if(!freeAccountAllowed(user))throw Object.assign(new Error("Confirme ton adresse e-mail avant de synchroniser ou analyser des données."),{status:403,code:"EMAIL_CONFIRMATION_REQUIRED"});
  return user;
}
const fr={
  title:"Compte WarBoost FREE",privacy:"J’accepte l’envoi des données que je choisis de synchroniser ou d’analyser, conformément à la politique de confidentialité.",
  note:"Sans code ni invitation. Alliance facultative. Les droits PRO et de gestion d’alliance sont distincts.",
  request:"Demander à rejoindre mon alliance",pending:"Demande envoyée. Aucun accès d’alliance avant validation par un responsable.",
  approved:"Adhésion approuvée côté serveur. Vérifie l’état de synchronisation avant d’ouvrir les données d’alliance.",
  create:"Créer / retrouver mon espace d’alliance",verification:"Une preuve indépendante de ton identité et de ton grade R4/R5 est nécessaire. Une déclaration ou un roster saisi ne suffit pas.",
  existing:"Cet espace existe déjà. Utilise « Demander à rejoindre mon alliance » ; aucun code n’est nécessaire.",
  provisional:"Espace provisoire privé. Tu es fondateur WarBoost, pas R4/R5 vérifié du jeu. Ce brouillon ne donne accès à aucun membre, compte ou espace existant ; aucune adhésion ni publication automatique.",
  draftLabel:"Brouillon privé : un pseudo par ligne ; grade du jeu déclaré facultatif après un point-virgule (ex. Pseudo ; R3). Maximum 100 noms.",
  saveDraft:"Enregistrer le brouillon privé",replaceDraft:"Recharger le brouillon enregistré et abandonner les modifications non enregistrées ?",
  workspaceOpen:"Ouvrir l’accueil de mon espace WarBoost",workspaceRequest:"Demander l’accès à cet espace",workspaceView:"Ouvrir le roster partagé",workspaceList:"Gérer mes demandes d’accueil",
  workspaceNotice:"Espace WarBoost indépendant, non officiel. Le fondateur gère seulement cet espace neuf ; aucun grade R4/R5 Last War n’est vérifié. L’accès au roster exige une demande, un pseudo correspondant et son approbation. Aucun accès aux anciennes alliances.",
  review:"Demandes d’adhésion",approve:"Approuver",reject:"Refuser",empty:"Aucune demande en attente.",error:"Action non confirmée. Tes données sont conservées."
};
const en={
  title:"WarBoost FREE account",privacy:"I consent to sending the data I choose to sync or analyse, under the privacy policy.",
  note:"No code or invitation. Alliance optional. PRO access and alliance management rights are separate.",
  request:"Request to join my alliance",pending:"Request sent. Alliance access requires approval by a manager.",
  approved:"Membership approved on the server. Check sync status before opening alliance data.",
  create:"Create / recover my alliance workspace",verification:"Independent evidence of your identity and R4/R5 role is required. A declaration or manually entered roster is not sufficient.",
  existing:"This workspace already exists. Use “Request to join my alliance”; no code is needed.",
  provisional:"Private provisional workspace. You are a WarBoost founder, not a verified in-game R4/R5. This draft grants no access to other members, accounts or existing workspaces; no automatic membership or publication.",
  draftLabel:"Private draft: one nickname per line; optional declared game rank after a semicolon (e.g. Nickname ; R3). Maximum 100 names.",
  saveDraft:"Save private draft",replaceDraft:"Reload the saved draft and discard unsaved changes?",
  workspaceOpen:"Open membership for my WarBoost workspace",workspaceRequest:"Request workspace access",workspaceView:"Open shared roster",workspaceList:"Manage workspace requests",
  workspaceNotice:"Independent, unofficial WarBoost workspace. The founder only manages this new space; no Last War R4/R5 rank is verified. Roster access requires a request, a matching nickname and approval. No access to legacy alliances.",
  review:"Membership requests",approve:"Approve",reject:"Reject",empty:"No pending requests.",error:"Action not confirmed. Your data is preserved."
};
// Explicit English fallback for the other supported locales; human translation remains required.
export function freeAccessCopy(locale="en"){return /^fr(?:-|$)/i.test(locale)?fr:en}
