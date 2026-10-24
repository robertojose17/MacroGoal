const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),React=require('react'),ts=require('typescript');
require.extensions['.tsx']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}),f);
test('chooser renders only supplied rows, waits for explicit selection, supports cancel/loading/error and both languages',()=>{
 const old=Module._load;let language='en';Module._load=function(n,p,i){if(n==='react-native')return {ActivityIndicator:'ActivityIndicator',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:x=>x}};if(n==='react-i18next')return {useTranslation:()=>({i18n:{language}})};return old.call(this,n,p,i)};
 try{const Component=require('../components/CoachSavedMealOptions.tsx').default,calls=[];
 const props={open:false,busy:false,available:true,rows:[{key:'owned-reference',title:'Earlier recipe',detail:'Recipe estimate'}],error:false,onOpen:()=>calls.push('open'),onClose:()=>calls.push('close'),onSelect:k=>calls.push(k)};
 const text=n=>n==null?'':typeof n==='string'?n:React.Children.toArray(n.props?.children).map(text).join(' '),nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)],button=(tree,label)=>nodes(tree).find(n=>n.props?.accessibilityRole==='button'&&text(n)===label);
 let tree=Component(props);assert.deepEqual(calls,[]);button(tree,'Earlier meals').props.onPress();assert.deepEqual(calls,['open']);
 props.open=true;tree=Component(props);assert.match(text(tree),/Nothing is added/);assert.deepEqual(calls,['open']);button(tree,'Earlier recipe').props.onPress();assert.deepEqual(calls,['open','owned-reference']);
 props.busy=true;tree=Component(props);assert.equal(button(tree,'Earlier recipe'),undefined);button(tree,'Close').props.onPress();assert.equal(calls.at(-1),'close');
 props.busy=false;props.error=true;tree=Component(props);assert.equal(button(tree,'Earlier recipe'),undefined);assert.ok(button(tree,'Try again'));
 language='es';props.error=false;props.rows=[];tree=Component(props);assert.match(text(tree),/No hay opciones/);props.open=false;assert.ok(button(Component(props),'Comidas anteriores'));
 props.available=false;assert.equal(button(Component(props),'Comidas anteriores').props.disabled,true);
 }finally{Module._load=old;}
});
