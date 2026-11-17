// Public GET-only diagnostic, separate from isolated Chromium tests. No cookies, auth, or browser profile.
const supplied=process.env.DIAGNOSTIC_DEPLOYMENT_URL;
if(!supplied){console.log(JSON.stringify({diagnostic:'public-deployment-response',skipped:true,reason:'no_target'}));process.exit(0)}
const allowed=new Set(['macro-goal.expo.app','macro-goal--ej3utqm2j7.expo.app']);
function validate(value){const url=new URL(value);if(url.protocol!=='https:'||!allowed.has(url.hostname)||url.port||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('diagnostic_target_not_allowed');return url.href}
const targets=[...new Set([validate('https://macro-goal.expo.app/'),validate(supplied)])];
const headersAllowed=new Set(['date','age','cache-control','etag','last-modified','vary','via','x-cache','x-cache-hits','cf-cache-status','content-type','eas-deployment-id','x-eas-deployment-id','eas-deployment','x-eas-deployment']);
for(const target of targets){
 try{
  // No redirects or cache-busting query. Ordinary HTTP no-cache semantics request fresh validation.
  const response=await fetch(target,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{accept:'text/html','cache-control':'no-cache'}});
  const headers=Object.fromEntries([...response.headers].filter(([name])=>headersAllowed.has(name)||/^x?-?eas-deployment(?:-[a-z]+)*$/.test(name)));
  const reader=response.body?.getReader();let length=0,chunks=[];
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1048576){await reader.cancel();throw Error('response_exceeds_1MiB')}chunks.push(value)}
  const html=new TextDecoder().decode(Buffer.concat(chunks)),scriptSources=[];
  if(response.ok&&/text\/html/i.test(response.headers.get('content-type')??''))for(const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)){
   const source=new URL(match[1],target);if(source.protocol==='https:'&&allowed.has(source.hostname))scriptSources.push(source.origin+source.pathname);
  }
  console.log(JSON.stringify({diagnostic:'public-deployment-response',target,status:response.status,headers,scriptSources,containsServiceWorker:/serviceWorker/.test(html),containsSwJs:/sw\.js/.test(html),htmlPrinted:false}));
 }catch(error){console.log(JSON.stringify({diagnostic:'public-deployment-response',target,error:error?.name==='TimeoutError'?'timeout':String(error.message),htmlPrinted:false}));process.exitCode=1}
}
