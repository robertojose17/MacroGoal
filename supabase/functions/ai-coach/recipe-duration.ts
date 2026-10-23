const norm=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
/** Visible publisher TOTAL duration in the exact unique primary recipe section. Never Active or Prep time. */
export function publishedRecipeTotalMinutes(content:string,name:string):number|null{
 if(content.length>1024*1024)return null;
 const lines=content.split(/\r?\n/),headings=lines.map((line,i)=>({line,i})).filter(x=>/^\s*#\s+\S/.test(x.line));
 if(headings.length!==1||norm(headings[0].line.replace(/^\s*#\s+/,''))!==norm(name))return null;
 const start=headings[0].i+1;let end=lines.findIndex((line,i)=>i>=start&&/^\s*#{1,6}\s+\S/.test(line));if(end<0)end=lines.length;
 const section=lines.slice(start,end).join('\n').slice(0,1600),values=[];
 for(const m of section.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?(?:Total|Total Time)\s*:\s*(?:(\d{1,2})\s*(?:hours?|hrs?|h)\s*)?(?:(\d{1,3})\s*(?:minutes?|mins?|min|m))?\s*(?=\n|$)/gi)){
  const value=Number(m[1]??0)*60+Number(m[2]??0);if(value>0&&value<=1440)values.push(value);
 }
 return values.length&&new Set(values).size===1?values[0]:null;
}
