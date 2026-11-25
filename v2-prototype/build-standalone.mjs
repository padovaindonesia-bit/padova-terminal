import fs from 'node:fs/promises';
const folder=new URL('.',import.meta.url);
const html=await fs.readFile(new URL('index.html',folder),'utf8');
const engine=(await fs.readFile(new URL('engine.mjs',folder),'utf8')).replaceAll(/\bexport /g,'');
const ui=(await fs.readFile(new URL('prototype.mjs',folder),'utf8')).replace(/^import .*? from '\.\/engine\.mjs';\s*/,'');
const combined=html.replace('<script type="module" src="./prototype.mjs"></script>',`<script>\n${engine}\n${ui}\n</script>`);
await fs.writeFile(new URL('PADOVA_V2_Inventory_Demo.html',folder),combined);
console.log('Standalone HTML generated');
