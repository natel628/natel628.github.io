import fs from 'node:fs';
const p = 'sites/whats-happening/js/views2.js';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('Live data sources')) { console.log('already fixed'); process.exit(0); }
const start = s.indexOf('Live data sources');
const secStart = s.lastIndexOf('<section', start);
const secEnd = s.indexOf('</section>', start);
if (secStart < 0 || secEnd < 0) { console.error('section bounds not found'); process.exit(1); }
const rep = '<section class="panel"><h2>Live data</h2><p class="panel__sub">Live listings refresh automatically every day from the site feed. No keys needed in this browser.</p></section>';
s = s.slice(0, secStart) + rep + s.slice(secEnd + '</section>'.length);
fs.writeFileSync(p, s);
console.log('patched views2');
