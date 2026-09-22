import { cp,readFile,writeFile,mkdir } from 'node:fs/promises';
await mkdir('dist/native',{recursive:true});await cp('dist/web','dist/native',{recursive:true});await writeFile('dist/native/index.html',await readFile('dist/web/app.html'));
console.log('Native web assets prepared. No remote server URL is embedded.');
