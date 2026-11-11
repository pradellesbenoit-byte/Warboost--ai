// Personal FREE access depends on a Supabase-confirmed account, never an
// invitation, alliance membership, or browser-supplied identity.
export function freeAccountAllowed(user){
  return Boolean(user?.id&&user?.email&&typeof user?.email_confirmed_at==="string"&&
    Number.isFinite(Date.parse(user.email_confirmed_at)));
}

export function assertFreeAccount(user){
  if(!freeAccountAllowed(user))
    throw Object.assign(new Error("Confirme ton adresse e-mail avant d’accéder aux fonctions FREE."),{
      status:403,
      code:"EMAIL_CONFIRMATION_REQUIRED"
    });
  return user;
}
