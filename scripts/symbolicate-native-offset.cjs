// Offline, no network. Usage: node script.js evidence-dir image-uuid image-offset preferred-vmaddr
// Read preferred __TEXT vmaddr from exported load commands, never use ASLR load address here.
const fs=require('fs'),path=require('path');
function resolve(dir,uuid,offset,base){
 const evidence=JSON.parse(fs.readFileSync(path.join(dir,'BUILD-EVIDENCE.json'),'utf8'));
 const image=evidence.images.find(i=>i.uuid===uuid.toLowerCase());if(!image)throw Error('UUID not present in retained symbol evidence');
 const target=BigInt(base)+BigInt(offset);
 const rows=fs.readFileSync(path.join(dir,image.symbolMap),'utf8').split('\n').flatMap(l=>{const m=l.match(/^([0-9a-fA-F]+)\s+([tT])\s+(.+)$/);return m?[{address:BigInt('0x'+m[1]),symbol:m[3]}]:[];}).sort((a,b)=>a.address<b.address?-1:a.address>b.address?1:0);
 let found,next;for(const row of rows){if(row.address>target){next=row;break;}found=row;}
 if(!found)throw Error('No preceding text symbol');
 return {uuid:image.uuid,symbol:found.symbol,offset:(target-found.address).toString(),nextSymbolAddress:next?'0x'+next.address.toString(16):null,limitation:'Nearest retained text symbol; not an inline/source-line backtrace or proof of initiating cause'};
}
if(require.main===module){const [dir,uuid,offset,base]=process.argv.slice(2);if(!base)throw Error('Expected evidence-dir UUID image-offset preferred-vmaddr');console.log(JSON.stringify(resolve(dir,uuid,offset,base),null,2));}
module.exports={resolve};
