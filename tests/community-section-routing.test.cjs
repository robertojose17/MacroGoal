const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const screen=fs.readFileSync(path.join(__dirname,'../app/(tabs)/check-ins.tsx'),'utf8');
const start=screen.indexOf('  const handlePosted = useCallback(');
const handler=screen.slice(start,screen.indexOf('\n  //',start));
for(const section of ['feed','club']) {
  for(const activeTab of ['feed','club','friends']) {
    test(`a ${section} post stays in ${section} when active tab is ${activeTab}`,()=>{
      const lists={feed:[],club:[]},refresh=[];
      const context={activeTab,currentUserId:'owner',useCallback:fn=>fn,console:{log(){}},
        setFeedPosts:fn=>{lists.feed=fn(lists.feed);},setClubPosts:fn=>{lists.club=fn(lists.club);},
        fetchFeedPosts:()=>refresh.push('feed'),fetchClubPosts:()=>refresh.push('club'),setTimeout:fn=>fn()};
      vm.runInNewContext(ts.transpile(handler+'\nthis.posted=handlePosted;', {target:ts.ScriptTarget.ES2022}),context);
      const post={id:'existing-post',section};
      context.posted(post);
      assert.equal(lists[section].length,1); assert.equal(lists[section][0],post);
      assert.deepEqual(lists[section==='feed'?'club':'feed'],[]);
      assert.deepEqual(refresh,[section]);
    });
  }
}
