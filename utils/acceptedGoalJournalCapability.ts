/** Capability hint only, never proof of durable storage or permission to submit.
 * The journal must still complete recovery, encrypted writes and readback before RPC.
 * No browser permission request or storage mutation occurs in this check. */
export function acceptedGoalJournalAvailable(platform:string):boolean {
 if(platform==='ios'||platform==='android')return true;
 if(platform!=='web')return false;
 try {
  return globalThis.isSecureContext===true && typeof globalThis.indexedDB?.open==='function' &&
   typeof globalThis.crypto?.subtle?.encrypt==='function' && typeof globalThis.crypto?.subtle?.decrypt==='function' &&
   typeof globalThis.crypto?.subtle?.generateKey==='function' && typeof globalThis.crypto?.subtle?.digest==='function' &&
   typeof globalThis.crypto?.getRandomValues==='function' && typeof globalThis.crypto?.randomUUID==='function' &&
   typeof globalThis.navigator?.locks?.request==='function' && typeof globalThis.CryptoKey==='function' &&
   typeof globalThis.TextEncoder==='function' && typeof globalThis.TextDecoder==='function' &&
   typeof globalThis.localStorage?.getItem==='function' && typeof globalThis.localStorage?.setItem==='function';
 } catch { return false; }
}
