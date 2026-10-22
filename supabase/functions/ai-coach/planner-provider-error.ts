/** Private enum-only diagnostic. Never return provider text, prompts, URLs or metadata. */
export function classifyStructuredProviderError(data:unknown):{provider_error_reason:'schema_complexity'|'invalid_schema'|'unsupported_parameter'|'context_limit'|'authentication'|'rate_limit'|'unknown';provider_error_code?:number}{
 const error=(data&&typeof data==='object'&&!Array.isArray(data)?(data as any).error:undefined);
 let message=typeof error?.message==='string'?error.message.slice(0,4096):'';
 // OpenRouter can wrap an upstream JSON error in metadata.raw. Inspect only a bounded message.
 const raw=error?.metadata?.raw;
 if(typeof raw==='string'&&raw.length<=4096){try{const parsed=JSON.parse(raw);if(typeof parsed?.error?.message==='string')message+=' '+parsed.error.message.slice(0,4096);}catch{/* Unknown upstream envelope stays unknown. */}}
 const text=message.toLowerCase();
 const reason=/schema/.test(text)&&/(?:too (?:complex|many)|complexity|nesting|too deeply)/.test(text)?'schema_complexity':
  /(?:invalid|unsupported|malformed).{0,40}(?:json.?schema|response.?schema)|(?:json.?schema|response.?schema).{0,40}(?:invalid|unsupported|malformed)/.test(text)?'invalid_schema':
  /(?:unsupported|unrecognized|unknown) (?:parameter|argument)/.test(text)?'unsupported_parameter':
  /(?:context length|context window|maximum context|too many tokens)/.test(text)?'context_limit':
  /(?:invalid api key|invalid authentication|unauthorized)/.test(text)?'authentication':
  /(?:rate limit|too many requests)/.test(text)?'rate_limit':'unknown';
 const code=error?.code;
 return {provider_error_reason:reason,...(Number.isInteger(code)&&code>=100&&code<=599?{provider_error_code:code}:{})};
}
