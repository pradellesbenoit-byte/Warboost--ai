import fs from "node:fs";
import {translationDiagnostics,LANGUAGES} from "../i18n.js";
const keys=new Set();
for(const path of ["index.html","app.js",...fs.readdirSync("lib").filter(name=>name.endsWith(".js")).map(name=>`lib/${name}`)]){
  const text=fs.readFileSync(path,"utf8");
  for(const match of text.matchAll(/(?:data-i18n(?:-aria|-alt|-placeholder)?=["']|\bt\(["'])([a-z][a-z0-9_]+)["']/g))keys.add(match[1]);
}
console.log(JSON.stringify({note:"English-equivalent strings include proper names and untranslated fallback; counts are an audit signal, NOT native-language certification.",
  languageVariants:LANGUAGES.filter(([code])=>code!=="auto").length,catalog:translationDiagnostics([...keys])},null,2));
