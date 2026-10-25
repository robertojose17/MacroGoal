const deps=process.env.BARCODE_RECOVERY_NODE_MODULES || require("node:path").resolve(__dirname,"../node_modules"); const ts=require(deps+"/typescript/lib/typescript.js");
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const files=['components/BarcodeRecoveryScreen.tsx','app/food-photo-capture.tsx','supabase/functions/vision-nutrition-extract/recovery.ts','supabase/functions/vision-nutrition-extract/recovery-discovery.ts','supabase/functions/vision-nutrition-extract/index.ts'];
let failed=false;
for(const file of files) {
 const result=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
 for(const d of result.diagnostics||[]) { failed=true;console.log(file+': '+ts.flattenDiagnosticMessageText(d.messageText,' '));}
}
const options={noEmit:true,strict:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,allowJs:true,checkJs:false,esModuleInterop:true,baseUrl:root,paths:{'@/*':['./*'],'react':[deps+'/@types/react/index.d.ts'],'react/*':[deps+'/@types/react/*'],'*':[deps+'/*']},types:[],typeRoots:[deps+'/@types']};
const program=ts.createProgram(files.slice(0,2).map(f=>path.join(root,f)),options);
const relevant=new Set(files.map(f=>path.join(root,f).replaceAll('\\','/')));
const diagnostics=ts.getPreEmitDiagnostics(program);
for(const d of diagnostics) {
 if(d.file&&relevant.has(d.file.fileName.replaceAll('\\','/'))) {
  failed=true;const at=d.file.getLineAndCharacterOfPosition(d.start||0);
  console.log(d.file.fileName+':'+(at.line+1)+': '+ts.flattenDiagnosticMessageText(d.messageText,' '));
 }
}
console.log('Changed files syntax and frontend type diagnostics: '+(failed?'FAILED':'PASS')+'; dependency diagnostics excluded: '+diagnostics.filter(d=>!d.file||!relevant.has(d.file.fileName.replaceAll('\\','/'))).length);
process.exitCode=failed?1:0;

