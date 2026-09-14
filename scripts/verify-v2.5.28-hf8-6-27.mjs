import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('app.js'), html=read('index.html'), i18n=read('i18n.js'), sw=read('sw.js'), health=read('api/health.js');
function need(ok,msg){if(!ok)throw new Error(msg)}
need(/const RELEASE_LABEL="HF8\.6\.(?:27|2[8-9]|[3-9]\d*)"/.test(app),'release label missing');
need(/WarBoost V2\.5\.28 HF8\.6\.(?:27|2[8-9]|[3-9]\d*)/.test(html),'HTML release missing');
need(/\/app\.js\?v=hf86(?:27|2[8-9]|[3-9]\d*)/.test(html)&&/\/publisher-ui\.js\?v=hf86(?:27|2[8-9]|[3-9]\d*)/.test(html),'cache bust missing');
need(/V2\.5\.28 HF8\.6\.(?:27|2[8-9]|[3-9]\d*)/.test(i18n),'i18n release missing');
need(/hf8-6-(?:27-critical-ui-repaint-reliability|2[8-9]-|[3-9]\d*-)/.test(sw),'service worker cache missing');
need(/release:"HF8\.6\.(?:27|2[8-9]|[3-9]\d*)"/.test(health),'health release missing');
need(app.includes('function queueCriticalUiRepaint()'),'critical repaint queue missing');
need(app.includes('CRITICAL_ADVICE_${label}')||app.includes('safeRenderStep("CRITICAL_ADVICE",renderAdvice)'),'Coach critical repaint missing');
need(app.includes('CRITICAL_PROVIDER_${label}')||app.includes('safeRenderStep("CRITICAL_PROVIDER",renderProvider)'),'Sync critical repaint missing');
need(app.includes('CRITICAL_SEASON_ACCESS_${label}')||app.includes('safeRenderStep("CRITICAL_SEASON_ACCESS",renderSeasonAccess)'),'Season critical repaint missing');
need(app.includes('title.textContent=t("hello",{name:p.name});text.textContent=t("sync_four");action.textContent=t("open_player")'),'Coach player-aware baseline must paint before optional priority calculation');
need(app.includes('notice.hidden=confirmed')&&app.includes('notice.style.display=confirmed?"none":""'),'confirmed season must hard-hide empty notice');
need(app.includes('sync.status==="ok"||sync.last_sync?t("safe_sync_done"):t("safe_sync_note")'),'Sync panel must leave transient Synchronisation after READY');
need(app.includes('SEASON_OPEN_ACCESS'), 'Season drawer open access refresh missing');
need(app.includes('queueCriticalUiRepaint();\n  return pulled||'), 'profile restore must schedule final critical repaint');
need(app.includes('renderPro();queueCriticalUiRepaint();\n    return result;'), 'runtime reconciliation must schedule final critical repaint');
// Guard against accidental duplicate IDs in the shipped HTML.
const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
const dup=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
need(dup.length===0,`duplicate HTML ids: ${dup.join(', ')}`);
console.log('HF8.6.27 Critical UI Repaint Reliability: PASS');
