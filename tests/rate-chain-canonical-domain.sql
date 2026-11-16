-- Conservative serializer domain checks, pure JSON only. Not universal JS parity.
DO $domain$ DECLARE v jsonb; caught boolean; r jsonb;c text; d text; BEGIN
 FOR v IN SELECT value FROM jsonb_array_elements('[{"é":1},{"😀":1},{"n":1e21},{"n":1e-7}]'::jsonb) LOOP
  caught:=false;
  BEGIN PERFORM tdee_rate_chain_private.canonical(v); EXCEPTION WHEN OTHERS THEN caught:=true; END;
  IF NOT caught THEN RAISE EXCEPTION 'unsupported canonical domain admitted %',v; END IF;
 END LOOP;
 IF tdee_rate_chain_private.canonical('{"z":"niño 😀","a":0.1,"m":[true,null,1234567890123]}'::jsonb) IS DISTINCT FROM '{"a":0.1,"m":[true,null,1234567890123],"z":"niño 😀"}' THEN RAISE EXCEPTION 'supported string values/numbers mismatch'; END IF;
 -- Self-hashed noncanonical legacy content must remain invalid.
 FOREACH c IN ARRAY ARRAY['{"a":1.0}','{ "a": 1 }','{"z":2,"a":1}'] LOOP
  d:=encode(sha256(convert_to(c,'UTF8')),'hex');r:=c::jsonb||jsonb_build_object('canonicalContent',c,'receiptDigest',d);
  IF tdee_rate_chain_private.content_valid(r,'receiptDigest') THEN RAISE EXCEPTION 'noncanonical legacy admitted'; END IF;
 END LOOP;
END $domain$;
