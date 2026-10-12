// Strict in-memory ViewShot data-uri decoder. No file/network fallback.
export function decodeCapturedJpeg(uri:string):ArrayBuffer{
 const prefix='data:image/jpeg;base64,';
 if(typeof uri!=='string'||!uri.startsWith(prefix))throw Error('Invalid capture');
 const text=uri.slice(prefix.length),max=8*1024*1024;
 if(text.length===0||text.length>Math.ceil(max/3)*4||text.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(text))throw Error('Invalid capture');
 const pad=text.endsWith('==')?2:text.endsWith('=')?1:0;const size=text.length/4*3-pad;if(size>max)throw Error('Invalid capture');
 const out=new Uint8Array(size),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let cursor=0;
 for(let i=0;i<text.length;i+=4){const a=alphabet.indexOf(text[i]),b=alphabet.indexOf(text[i+1]),c=text[i+2]==='='?0:alphabet.indexOf(text[i+2]),d=text[i+3]==='='?0:alphabet.indexOf(text[i+3]);const value=(a<<18)|(b<<12)|(c<<6)|d;if(cursor<size)out[cursor++]=(value>>16)&255;if(cursor<size)out[cursor++]=(value>>8)&255;if(cursor<size)out[cursor++]=value&255;}
 if(out.length<3||out[0]!==255||out[1]!==216||out[2]!==255)throw Error('Invalid capture');return out.buffer as ArrayBuffer;
}
