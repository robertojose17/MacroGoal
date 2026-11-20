import assert from 'node:assert/strict';
import test from 'node:test';
import {isCommunityWindowFocused, observeCommunityWindowFocus} from '../features/communityPrivacyV2/communityWindowFocus.mjs';

test('web does not use native focus events and closes on blur or hidden tabs',()=>{
  const win=new EventTarget();
  const doc=Object.assign(new EventTarget(),{visibilityState:'visible',hasFocus:()=>true});
  const forbidden={addEventListener(){throw Error('unsupported native event');}};
  const trace=[];
  const stop=observeCommunityWindowFocus('web',forbidden,()=>trace.push('closed'),()=>trace.push('open'),win,doc);
  win.dispatchEvent(new Event('blur'));
  doc.visibilityState='hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  win.dispatchEvent(new Event('focus'));
  doc.visibilityState='visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  stop();
  win.dispatchEvent(new Event('blur'));
  assert.deepEqual(trace,['open','closed','open']);
});

test('web begins closed when visible but unfocused or when DOM is missing',()=>{
  const win=new EventTarget();
  const doc=Object.assign(new EventTarget(),{visibilityState:'visible',hasFocus:()=>false});
  const trace=[];
  assert.equal(isCommunityWindowFocused('web',doc),false);
  observeCommunityWindowFocus('web',null,()=>trace.push('closed'),()=>trace.push('open'),win,doc)();
  observeCommunityWindowFocus('web',null,()=>trace.push('closed'),()=>trace.push('open'),null,null)();
  assert.deepEqual(trace,['closed','closed']);
});

test('native preserves AppState event forwarding and removes both subscriptions',()=>{
  const callbacks=new Map();
  const appState={addEventListener(event,fn){callbacks.set(event,fn);return {remove(){callbacks.delete(event);}};}};
  const trace=[];
  const stop=observeCommunityWindowFocus('ios',appState,()=>trace.push('closed'),()=>trace.push('open'));
  callbacks.get('blur')();
  callbacks.get('focus')();
  stop();
  assert.equal(isCommunityWindowFocused('ios',null),true);
  assert.deepEqual(trace,['closed','open']);
  assert.equal(callbacks.size,0);
});
