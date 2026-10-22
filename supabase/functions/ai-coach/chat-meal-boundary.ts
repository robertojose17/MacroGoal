// Presentation boundary for unstructured legacy chat. Never treats model text
// as a nutrition source, regardless of whether a keyword handoff recognized intent.
// Normal SSE text remains streaming; the authority notice precedes the first token
// and survives corrected_text replacement by existing clients.
export async function boundLegacyMealChat(req:Request,handler:(req:Request)=>Promise<Response>):Promise<Response>{
 let body:any;try{body=await req.clone().json();}catch{return handler(req);}
 const response=await handler(req);
 if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))return response;
 const es=String(body?.language??'en').startsWith('es');
 const notice=es?'Las cifras de comidas en el chat son estimaciones no verificadas. Usa «Elegir comida» para revisar porciones con una fuente.\n\n':'Meal numbers in chat are unverified estimates. Use “Choose a meal” to review source-backed portions.\n\n';
 const encoder=new TextEncoder(),decoder=new TextDecoder();let pending='';
 const frame=(v:unknown)=>encoder.encode('data: '+JSON.stringify(v)+'\n\n');
 const transform=new TransformStream<Uint8Array,Uint8Array>({
  start(c){c.enqueue(frame({token:notice,nutrition_authority:'unverified_conversation'}));},
  transform(chunk,c){pending+=decoder.decode(chunk,{stream:true});if(pending.length>131072)throw Error('chat_frame_too_large');const blocks=pending.split(/\r?\n\r?\n/);pending=blocks.pop()!;
   for(const block of blocks){if(!block.trim())continue;const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data==='[DONE]'){c.enqueue(encoder.encode('data: [DONE]\n\n'));continue;}
    let value:any;try{value=JSON.parse(data);}catch{continue;}
    value.nutrition_authority='unverified_conversation';
    if(value.done){if(typeof value.corrected_text==='string')value.corrected_text=notice+value.corrected_text;
     // Model-only meal actions cannot become source-backed Add/plan controls.
     if(['add_food_to_diary','create_meal_plan'].includes(value.action_proposal?.action_type))value.action_proposal=null;
     // Preserve validated typed meal_conversation when present; no generic wizard.
    }c.enqueue(frame(value));
   }
  },flush(){if(pending.trim())throw Error('incomplete_chat_frame');}
 });
 const headers=new Headers(response.headers);headers.delete('content-length');headers.set('Cache-Control','no-store');
 return new Response(response.body.pipeThrough(transform),{status:response.status,headers});
}
