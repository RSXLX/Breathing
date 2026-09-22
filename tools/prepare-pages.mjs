import { mkdir, readFile, writeFile } from 'node:fs/promises';
const source = 'Breathe-City-All-In-One/01-project/breathe-city/dist/breathe-city-preview.html';
let html = await readFile(source, 'utf8');
html = html.replaceAll('Breathe City', 'Breathing').replaceAll('BREATHE CITY', 'BREATHING');
// Pages hosts the local creative workflow; cloud generation requires the Node server.
html = html.replace('<details class="cloud-box">', '<details class="cloud-box" hidden>');
html = html.replace(/<a class="legacy-link"[^>]*>[^<]*<\/a>/, '');
await mkdir('_site', { recursive: true });
await writeFile('_site/index.html', html);
await writeFile('_site/.nojekyll', '');
console.log('Prepared standalone local-mode Breathing demo for GitHub Pages.');
