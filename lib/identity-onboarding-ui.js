export function mountIdentityOnboarding(document) {
  const dialog = document.createElement("dialog");
  dialog.id = "identityOnboardingDialog";
  dialog.className = "identityOnboarding";
  dialog.setAttribute("aria-labelledby", "identityOnboardingTitle");
  dialog.setAttribute("aria-describedby", "identityOnboardingIntro");

  dialog.innerHTML = `
    <form id="identityOnboardingForm" class="identityOnboardingForm">
      <header class="identityOnboardingHeader">
        <p class="identityOnboardingEyebrow">WarBoost · Last War</p>
        <h2 id="identityOnboardingTitle" data-i18n="identity_onboarding_title">Complète ton profil Last War</h2>
        <p id="identityOnboardingIntro" class="identityOnboardingIntro" data-i18n="identity_onboarding_intro">Ces informations associent tes scans à ton identité de joueur et à ton alliance.</p>
      </header>

      <div class="identityOnboardingFields">
        <label class="identityOnboardingField" for="identityOnboardingName">
          <span data-i18n="nickname">Pseudo dans le jeu</span>
          <input id="identityOnboardingName" name="name" type="text" maxlength="80" required autocomplete="off" spellcheck="false" dir="auto" />
        </label>
        <label class="identityOnboardingField" for="identityOnboardingServer">
          <span data-i18n="server">Serveur</span>
          <input id="identityOnboardingServer" name="server_id" type="text" maxlength="20" required autocomplete="off" inputmode="numeric" pattern="[0-9]+" dir="ltr" />
        </label>
        <label class="identityOnboardingField" for="identityOnboardingAlliance">
          <span data-i18n="alliance">Alliance</span>
          <input id="identityOnboardingAlliance" name="alliance_tag" type="text" maxlength="16" required autocomplete="off" dir="auto" />
        </label>
      </div>

      <div id="identityOnboardingStatus" class="identityOnboardingStatus" role="status" aria-live="polite"></div>
      <button id="identityOnboardingContinue" class="primaryAction identityOnboardingContinue" type="submit" data-i18n="identity_onboarding_continue" disabled>Continuer</button>
    </form>
  `;

  const form = dialog.querySelector("#identityOnboardingForm");
  const inputs = {
    name: dialog.querySelector("#identityOnboardingName"),
    server_id: dialog.querySelector("#identityOnboardingServer"),
    alliance_tag: dialog.querySelector("#identityOnboardingAlliance"),
  };
  const button = dialog.querySelector("#identityOnboardingContinue");
  const status = dialog.querySelector("#identityOnboardingStatus");

  dialog.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(dialog);
  dialog.showModal();

  return { dialog, form, inputs, button, status };
}