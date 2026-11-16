/** Reproducible synthetic JSON differential checks; no operational rows. */
import fs from 'node:fs';
import {energyParityFixtures} from './rate-energy-parity-fixtures.mjs';
const source=fs.readFileSync(new URL('../release-candidates/tdee-adaptive-review/rateEnergyParityCandidate.sql',import.meta.url),'utf8');
const cases=energyParityFixtures();
const sql=source.replace(/ROLLBACK;\s*$/,'')+String.raw`
DO $parity$ DECLARE c jsonb; actual jsonb; BEGIN
 FOR c IN SELECT value FROM jsonb_array_elements($fixtures$`+JSON.stringify(cases)+String.raw`$fixtures$::jsonb) LOOP
 actual:=macrogoal_snapshot_review_private.validate_rate_energy_candidate_v1(c->'input',c->'proposal');
 IF NOT actual @> (c->'expected') THEN RAISE EXCEPTION 'energy parity mismatch: % actual % expected %',c->>'name',actual,c->'expected'; END IF;
 END LOOP;
END $parity$;
ROLLBACK;
`;
fs.writeFileSync(new URL('./rate-energy-parity-rollback.sql',import.meta.url),sql);
console.log('Generated '+cases.length+' synthetic energy checks; not executed.');
