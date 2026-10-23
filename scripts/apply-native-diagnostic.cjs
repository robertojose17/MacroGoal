const fs=require('fs'),path=require('path'),crypto=require('crypto');
const original='b7a976004c231dfc93aefe5c949e5ec43abf1c434a8c1dbb75f9d9f70754d51e',patched='245c119e54a76dc39836fe119c5eaa0c2e898d9bb6f9ac46ddfcc5aa39dac755';
function apply(root){
 const rn=path.join(root,'node_modules/react-native');
 if(JSON.parse(fs.readFileSync(path.join(rn,'package.json'),'utf8')).version!=='0.81.4')throw Error('Native diagnostic requires exact RN0.81.4');
 const file=path.join(rn,'ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm');
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const current=sha(fs.readFileSync(file));
 if(current===patched)return 'already-patched';
 if(current!==original)throw Error('Native diagnostic source hash mismatch; no mutation');
 const candidate=fs.readFileSync(path.join(root,'patches/RCTTurboModule.diagnostic.mm'));
 if(sha(candidate)!==patched)throw Error('Native diagnostic candidate hash mismatch; no mutation');
 fs.writeFileSync(file,candidate);
 if(sha(fs.readFileSync(file))!==patched)throw Error('Native diagnostic verification failed');
 return 'patched';
}
if(require.main===module)console.log('MGNative diagnostic '+apply(path.resolve(__dirname,'..'))+' SHA256='+patched);
module.exports={apply,original,patched};
