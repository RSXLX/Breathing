import { build } from 'esbuild';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
await build({entryPoints:['native/app-shell.js'],bundle:true,format:'iife',target:['es2022'],outfile:'public/js/app-shell.bundle.js',minify:true,legalComments:'linked'});
await mkdir('public/vendor',{recursive:true});
await writeFile('public/vendor/ionic-core.css',await readFile('node_modules/@ionic/core/css/core.css'));
// App markup shares stable engine controls with the browser workbench.
let html=await readFile('public/index.html','utf8');html=html.replace('<body>','<body class="mobile-app">').replace('width=device-width,initial-scale=1','width=device-width,initial-scale=1,viewport-fit=cover').replace('<title>Breathe City · 呼吸城市</title>','<title>呼吸城市 App</title>').replace('<link rel="stylesheet" href="/css/studio.css">','<link rel="stylesheet" href="/vendor/ionic-core.css"><link rel="stylesheet" href="/css/studio.css"><link rel="stylesheet" href="/css/app.css">').replace('<script type="module" src="/js/studio.js">','<script src="/js/app-shell.bundle.js"></script><script type="module" src="/js/studio.js">');
await writeFile('public/app.html',html);
console.log('Built Ionic/Capacitor app shell from shared studio controls.');
