const fs = require('fs');
const path = 'supabase/functions/generate-meal-plan/index.ts';
const content = fs.readFileSync(path, 'utf8');
const compressed = content.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(path, compressed);
// eslint-disable-next-line no-undef
console.log('Bytes after compression:', Buffer.byteLength(compressed, 'utf8'));
