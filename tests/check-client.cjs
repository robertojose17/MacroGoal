const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');const files=['components/BarcodeRecoveryScreen.tsx','app/food-photo-capture.tsx','app/barcode-scanner.tsx','app/barcode-lookup.tsx','app/my-foods-create.tsx','utils/unknownBarcodeAttempt.ts','utils/manualRecoveryProduct.ts','utils/manualRecoverySave.ts','utils/cameraCaptureBytes.ts','utils/packageBarcodeInput.ts'];
let errors=0;for(const file of files){const r=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});for(const d of r.diagnostics||[]){errors++;console.log(file,ts.flattenDiagnosticMessageText(d.messageText,' '));}}
console.log('Syntax diagnostics:',errors);process.exitCode=errors?1:0;
const p=ts.createProgram(files.map(f=>path.join(root,f)),{noEmit:true,strict:true,skipLibCheck:true,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,baseUrl:root,paths:{'@/*':['./*'],'react':[process.env.BARCODE_RECOVERY_NODE_MODULES+'/@types/react/index.d.ts'],'react/*':[process.env.BARCODE_RECOVERY_NODE_MODULES+'/@types/react/*'],'*':[process.env.BARCODE_RECOVERY_NODE_MODULES+'/*']},types:[]});
const selected=new Set(files.map(f=>path.join(root,f)));const ds=ts.getPreEmitDiagnostics(p).filter(d=>d.file&&selected.has(d.file.fileName));
console.log('Type diagnostic count (partial dependency materialization):',ds.length);for(const d of ds)console.log(path.relative(root,d.file.fileName)+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1),d.code,ts.flattenDiagnosticMessageText(d.messageText,' '));

// Missing dependencies are blockers, not a successful full semantic check.
if(ds.length)process.exitCode=1;
