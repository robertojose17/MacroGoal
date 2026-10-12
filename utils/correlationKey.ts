/** Correlation only. Authorization is authenticated actor+server mapping, not this key. */
export function createCorrelationKeys(now:()=>number=Date.now){let sequence=0;return()=>`publish:${Math.trunc(now())}:${++sequence}`;}
