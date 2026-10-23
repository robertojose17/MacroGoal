// EAS iOS success hook. Export only symbols, executable, and bounded build evidence.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),cp=require('child_process');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function walk(dir,accept,depth=0){if(depth>12||!fs.existsSync(dir))return [];const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(accept(p,e)){out.push(p);continue;}if(e.isDirectory())out.push(...walk(p,accept,depth+1));}return out;}
function run(args){return cp.execFileSync('xcrun',args,{encoding:'utf8',maxBuffer:128*1024*1024});}
function uuidRows(s){return [...s.matchAll(/UUID: ([A-Fa-f0-9-]+) \(([^)]+)\)/g)].map(m=>({uuid:m[1].toLowerCase(),arch:m[2]}));}
function gymLogDirectory(root,home){
 const gym=path.join(root,'ios/Gymfile');
 const lines=fs.existsSync(gym)?fs.readFileSync(gym,'utf8').split(/\r?\n/).filter(l=>/^\s*buildlog_path\b/.test(l)):[];
 if(lines.length>1)throw Error('Ambiguous Gymfile buildlog_path');
 let target=path.join(home,'Library/Logs/gym');
 if(lines.length){
  // Only a single quoted literal, optional parentheses/comment. No Ruby execution or expansion.
  const m=lines[0].match(/^\s*buildlog_path\s*(?:\(\s*)?(['"])([^'"\\\r\n]+)\1\s*\)?\s*(?:#.*)?$/);
  if(!m||/[#$`]/.test(m[2])||m[2].startsWith('~'))throw Error('Unsupported Gymfile buildlog_path expression');
  target=path.resolve(root,'ios',m[2]);
 }
 const within=(base,p)=>{const r=path.relative(base,p);return r!==''&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
 const allowed=[path.dirname(root),path.join(home,'Library/Logs')];
 if(!allowed.some(base=>within(base,target)))throw Error('Gym log path outside bounded build/log roots');
 if(fs.existsSync(target)){
  const real=fs.realpathSync(target);
  if(!allowed.some(base=>within(fs.realpathSync(base),real)))throw Error('Gym log symlink escapes bounded roots');
  target=real;
 }
 return target;
}
function main(options={}){
 if((options.platform||process.env.EAS_BUILD_PLATFORM)!=='ios')return;
 const root=options.root||path.resolve(__dirname,'..'),home=options.home||os.homedir(),run=options.run||moduleRun,out=path.join(root,'native-diagnostics');fs.mkdirSync(out,{recursive:true});
 const report={schema:1,sourceCompilationConfirmed:false,images:[],errors:[]};
 try{
  const props=JSON.parse(fs.readFileSync(path.join(root,'ios/Podfile.properties.json'),'utf8'));
  if(String(props['ios.buildReactNativeFromSource'])!=='true')throw Error('Prebuild source-build setting missing');
  const patch=fs.readFileSync(path.join(root,'patches/RCTTurboModule.diagnostic.mm'));
  const installed=fs.readFileSync(path.join(root,'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm'));
  if(sha(patch)!==sha(installed))throw Error('Installed native patch differs');
  report.patchSHA256=sha(installed);report.sourceBuildProperty=true;
  const logDir=gymLogDirectory(root,home);
  const logs=fs.existsSync(logDir)?fs.readdirSync(logDir,{withFileTypes:true}).filter(e=>e.isFile()&&!e.isSymbolicLink()&&e.name.endsWith('.log')).map(e=>path.join(logDir,e.name)):[];
  report.compileEvidence=logs.map(p=>{const b=fs.readFileSync(p),s=b.toString('utf8');return {sha256:sha(b),turboModuleCompileLines:s.split('\n').filter(l=>/CompileC|clang.* -c /.test(l)&&/RCTTurboModule\.mm/.test(l)).length};});
  report.sourceCompilationConfirmed=report.compileEvidence.some(e=>e.turboModuleCompileLines>0);
  // Archives only; never copy provisioning profiles, signing keys, environment, or logs.
  const archives=[...new Set([path.join(root,'ios/build'),path.join(home,'Library/Developer/Xcode/Archives')].flatMap(d=>walk(d,(p,e)=>e.isDirectory()&&p.endsWith('.xcarchive'))))];
  const candidates=archives.filter(a=>fs.existsSync(path.join(a,'Products/Applications/MacroGoal.app/MacroGoal')));
  if(candidates.length!==1)throw Error('Expected exactly one MacroGoal archive; found '+candidates.length);
  const archive=candidates[0],binary=path.join(archive,'Products/Applications/MacroGoal.app/MacroGoal');
  const appIds=uuidRows(run(['dwarfdump','--uuid',binary]));
  const dsymRoot=path.join(archive,'dSYMs');const dsymDirs=walk(dsymRoot,(p,e)=>e.isDirectory()&&p.endsWith('.dSYM'));
  for(const dsym of dsymDirs){
   const name=path.basename(dsym);if(!/^[A-Za-z0-9._-]+\.dSYM$/.test(name))throw Error('Unexpected symbol bundle name');
   const dwarfDir=path.join(dsym,'Contents/Resources/DWARF');
   const dwarfs=fs.readdirSync(dwarfDir).filter(n=>/^[A-Za-z0-9._-]+$/.test(n));
   fs.cpSync(dsym,path.join(out,'dSYMs',name),{recursive:true,dereference:false});
   for(const n of dwarfs){const dwarf=path.join(dwarfDir,n),ids=uuidRows(run(['dwarfdump','--uuid',dwarf]));
    const arm=ids.find(i=>i.arch==='arm64');if(!arm)continue;
    const map=run(['nm','-n','-arch','arm64','-C',dwarf]);
    const mapName=arm.uuid+'.symbols.txt';fs.writeFileSync(path.join(out,mapName),map);
    report.images.push({name:n,uuid:arm.uuid,arch:arm.arch,symbolMap:mapName,dwarfSHA256:sha(fs.readFileSync(dwarf)),mapSHA256:sha(map)});
   }
  }
  const app=appIds.find(i=>i.arch==='arm64');if(!app||!report.images.some(i=>i.uuid===app.uuid))throw Error('Matching arm64 app dSYM missing');
  fs.copyFileSync(binary,path.join(out,'MacroGoal'));
  report.appUUID=app.uuid;report.appSHA256=sha(fs.readFileSync(binary));
  report.loadCommands=run(['otool','-l',binary]);
  const frameworks=path.join(archive,'Products/Applications/MacroGoal.app/Frameworks');
  const nativeBinaries=[binary,...walk(frameworks,(p,e)=>e.isDirectory()&&p.endsWith('.framework')).map(p=>path.join(p,path.basename(p,'.framework'))).filter(p=>fs.existsSync(p))];
  const marked=nativeBinaries.filter(p=>fs.readFileSync(p).includes(Buffer.from('MGNative:')));
  if(marked.length!==1)throw Error('Expected diagnostic marker in exactly one native image');
  report.markerImage=path.basename(marked[0]);
  const markedUUID=uuidRows(run(['dwarfdump','--uuid',marked[0]])).find(i=>i.arch==='arm64');
  if(!markedUUID||!report.images.some(i=>i.uuid===markedUUID.uuid))throw Error('Diagnostic image matching dSYM missing');
  report.markerPresent=true;
  if(!report.sourceCompilationConfirmed)throw Error('RCTTurboModule source compilation not evidenced in gym logs');
 }catch(e){report.errors.push(e.message);}
 fs.writeFileSync(path.join(out,'BUILD-EVIDENCE.json'),JSON.stringify(report,null,2)+'\n');
 console.log('MGNative artifact export: '+report.images.length+' symbol images; sourceCompile='+report.sourceCompilationConfirmed+'; errors='+report.errors.length);
 if(report.errors.length)throw Error(report.errors.join('; '));
}
const moduleRun=run;
if(require.main===module)main();module.exports={uuidRows,walk,gymLogDirectory,main};
