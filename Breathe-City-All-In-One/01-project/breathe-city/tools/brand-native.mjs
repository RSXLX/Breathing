// Original geometric breathing-city mark; no downloaded artwork.
import sharp from 'sharp';
import {readFile,writeFile,readdir} from 'node:fs/promises';
const glyph='<path d="M290 650V410h110v240m56 0V295h112v355m56 0V460h110v190" fill="none" stroke="#cce99b" stroke-width="48" stroke-linejoin="round"/><path d="M258 755Q510 630 766 755" fill="none" stroke="#cce99b" stroke-width="36" stroke-linecap="round"/>';
const svg=(background=true)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background?'<rect width="1024" height="1024" fill="#244b38"/>':''}${glyph}</svg>`);
await writeFile('public/assets/app-icon.svg',svg());
await sharp(svg()).resize(1024).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
 const root=`android/app/src/main/res/mipmap-${density}`;
 for(const name of ['ic_launcher','ic_launcher_round'])await sharp(svg()).resize(size).png().toFile(`${root}/${name}.png`);
 await sharp(svg(false)).resize(Math.round(size*2.25)).png().toFile(`${root}/ic_launcher_foreground.png`);
}
await writeFile('android/app/src/main/res/values/ic_launcher_background.xml','<?xml version="1.0" encoding="utf-8"?><resources><color name="ic_launcher_background">#244b38</color></resources>\n');
const splash=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#f5f5f2"/><g transform="translate(1110 1110) scale(.5)"><rect width="1024" height="1024" rx="210" fill="#244b38"/>${glyph}</g></svg>`);
for(const name of (await readdir('ios/App/App/Assets.xcassets/Splash.imageset')).filter(n=>n.endsWith('.png')))await sharp(splash).png().toFile(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`);
for(const dir of (await readdir('android/app/src/main/res')).filter(n=>n.startsWith('drawable'))){
 const path=`android/app/src/main/res/${dir}/splash.png`;
 try{const meta=await sharp(await readFile(path)).metadata();await sharp(splash).resize(meta.width,meta.height,{fit:'contain',background:'#f5f5f2'}).png().toFile(path);}catch(error){if(error.code!=='ENOENT')throw error;}
}
console.log('Generated original native app icon and splash assets.');
