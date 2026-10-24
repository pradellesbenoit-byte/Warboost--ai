import sharp from "sharp";
import {readdir,writeFile,readFile} from "node:fs/promises";
const source="assets/warboost-icon-512.png",dark="#090e1a";
const sizes={mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192};
for(const [density,size] of Object.entries(sizes)){
  const base=`android/app/src/main/res/mipmap-${density}`;
  for(const name of ["ic_launcher","ic_launcher_round"])await sharp(source).resize(size,size).flatten({background:dark}).png().toFile(`${base}/${name}.png`);
  const foreground=Math.round(size*2.25),icon=await sharp(source).resize(size,size).png().toBuffer();
  await sharp({create:{width:foreground,height:foreground,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:icon,gravity:"centre"}]).png().toFile(`${base}/ic_launcher_foreground.png`);
}
const res="android/app/src/main/res";
const splash=async(file,width,height)=>{
  const logo=await sharp(source).resize(Math.min(440,Math.round(width*.35))).png().toBuffer();
  await sharp({create:{width,height,channels:3,background:dark}}).composite([{input:logo,gravity:"centre"}]).png().toFile(file);
};
for(const dir of await readdir(res))if(dir.startsWith("drawable")){
  const entries=await readdir(`${res}/${dir}`);
  if(entries.includes("splash.png"))await splash(`${res}/${dir}/splash.png`,dir.includes("land")?1280:720,dir.includes("land")?720:1280);
}
await writeFile(`${res}/mipmap-anydpi-v26/ic_launcher.xml`,'<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@mipmap/ic_launcher_foreground"/></adaptive-icon>');
await writeFile(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`,await readFile(`${res}/mipmap-anydpi-v26/ic_launcher.xml`));
await writeFile(`${res}/values/ic_launcher_background.xml`,'<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#090e1a</color></resources>');
await sharp(source).resize(1024,1024).flatten({background:dark}).png().toFile("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
for(const name of ["splash-2732x2732.png","splash-2732x2732-1.png","splash-2732x2732-2.png"])await splash(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`,2732,2732);
console.log("PASS native icons/splash derived only from assets/warboost-icon-512.png; no new game/third-party art.");
