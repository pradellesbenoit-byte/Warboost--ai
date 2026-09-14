import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('app.js'), html=read('index.html'), i18n=read('i18n.js'), sw=read('sw.js'), health=read('api/health.js'), pkg=JSON.parse(read('package.json'));
function need(ok,msg){if(!ok)throw new Error(msg)}
need(app.includes('const RELEASE_LABEL="HF8.6.28"'),'release label missing');
need(html.includes('WarBoost V2.5.28 HF8.6.28'),'HTML release missing');
need(html.includes('/app.js?v=hf8628')&&html.includes('/publisher-ui.js?v=hf8628'),'HF8.6.28 cache bust missing');
need(i18n.includes('V2.5.28 HF8.6.28'),'i18n release missing');
need(sw.includes('warboost-v2-5-28-hf8-6-28-mobile-ui-stabilization'),'service worker cache missing');
need(health.includes('release:"HF8.6.28"'),'health release missing');
need(pkg.description.includes('HF8.6.28'),'package description missing');
need(pkg.scripts.check.includes('verify-v2.5.28-hf8-6-28.mjs'),'check script missing HF8.6.28 verifier');
need(pkg.scripts.verify.includes('verify-v2.5.28-hf8-6-28.mjs'),'verify script missing HF8.6.28 verifier');
need(app.includes('function criticalUiRepaintPass(label="NOW")'),'multi-pass repaint helper missing');
need(app.includes('CRITICAL_ADVICE_${label}')&&app.includes('CRITICAL_PROVIDER_${label}')&&app.includes('CRITICAL_PLAYER_ACTIVITY_${label}'),'critical surfaces are not repainted together');
need(app.includes('setTimeout(()=>run("T120"),120)')&&app.includes('setTimeout(()=>run("T500"),500)')&&app.includes('setTimeout(()=>run("T1500"),1500)'),'Android settling repaint passes missing');
need(app.includes('run("NOW")'),'immediate repaint missing');
need(app.includes('window.addEventListener("focus",()=>{queueCriticalUiRepaint();void reconcileAuthenticatedRuntime("focus")})'),'focus recovery repaint missing');
need(app.includes('if(status)status.textContent=t("activity_no_confirmations");if(pill)pill.textContent="—";'),'Player Activity READY baseline missing');
need(app.includes('RENDER_PLAYER_ACTIVITY_RECENT'),'Player Activity secondary failure diagnostic missing');
need(app.includes('serverNow instanceof Date&&!Number.isNaN(serverNow.getTime())?serverNow.getTime():Date.now()'),'Player Activity safe clock fallback missing');
need(app.includes('ui_consistency:{coach_title:'),'support UI consistency diagnostics missing');
need(app.includes('safeRenderStep(`CRITICAL_DESERT_STORM_${label}`,renderDesertStormPlanner)'),'Desert Storm open-drawer repaint guard missing');
// Preserve HF8.6.27 Saison hard-hide and provider READY semantics.
need(app.includes('notice.hidden=confirmed')&&app.includes('notice.style.display=confirmed?"none":""'),'Season hard-hide regression');
need(app.includes('sync.status==="ok"||sync.last_sync?t("safe_sync_done"):t("safe_sync_note")'),'Provider READY regression');
// Guard against accidental duplicate IDs in shipped HTML.
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
need(dup.length===0,`duplicate HTML ids: ${dup.join(', ')}`);
console.log('HF8.6.28 Mobile UI Stabilization: PASS');
