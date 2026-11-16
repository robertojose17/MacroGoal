-- READ-ONLY cross-runtime UTF-8 digest/semantic check; verified 2026-11-16.
WITH f AS (SELECT $fixture${"unsigned":{"z":"ñ / \" canonical","a":1e-7,"b":1e+21,"c":[0,0.1,7700],"nested":{"rate":-0.7}},"canonicalContent":"{\"a\":1e-7,\"b\":1e+21,\"c\":[0,0.1,7700],\"nested\":{\"rate\":-0.7},\"z\":\"ñ / \\\" canonical\"}","digest":"436b9655f940c7bdac671933ac451933ab68bf6e61a1791d7f0331abeee331ad"}$fixture$::jsonb AS v)
SELECT encode(sha256(convert_to(v->>'canonicalContent','UTF8')),'hex')=v->>'digest' AS digest_matches,
 (v->>'canonicalContent')::jsonb=v->'unsigned' AS semantic_payload_matches,
 octet_length(v->>'canonicalContent')<=65536 AS bounded FROM f;
