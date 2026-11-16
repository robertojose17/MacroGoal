# UNVALIDATED residual block-bootstrap research

**Not an operational estimator, approved method, clinical review, or release artifact.** Outputs explicitly state `researchOnly: true` and `validated: false`; there is no operational review ID, approval, reliableInterval, recommendation, RPC, database write, or activation interface. This directory is source research only, not a deployed feature. No packages were installed or network requests made for this task.

## Method tested

- Same median pairwise slope convention as the existing diagnostic: only pairs at least seven **calendar** days apart, scaled to kg/week.
- Fourteen-calendar-day window with either 14 readings or a repeating missingness pattern giving exactly 8 readings. Missing dates stay missing; observations are never compressed to consecutive sample indices or interpolated.
- Fit median residual intercept and slope; resample residuals in three-calendar-day blocks, then refit the same slope. Each target block chooses uniformly among contiguous donor blocks containing all observed offsets required by that target's mask. This conditional-mask design is experimental, not an established validation result.
- Basic-bootstrap interval from 199 replicates and an explicitly experimental nominal level of 95%. Three-day block length and 95% nominal level are experiment settings, not adopted product policy.
- Deterministic seeds: trajectory `170000 + scenarioIndex*10000 + trial`; bootstrap `trajectorySeed*100 + dailyCheck`.

## Bounded experiment

60 independent synthetic trajectories per scenario, each with 14 overlapping daily evaluations (840 windows per scenario; 5,880 total). The known latent tissue trend is 0 kg/week except the loss scenario (-0.35 kg/week). Nuisance noise is Gaussian IID or stationary AR(1); sigma is the specified stationary SD, not innovation SD. Parameters (0.25/0.35 kg SD, AR coefficients, 1.5 kg outliers, and a 1 kg fluid step) are transparent synthetic stress assumptions, **not estimated population distributions**. Persistent fluid shift begins on simulated day 17 and is not classified as latent tissue change.

| Scenario | Nominal 95% coverage observed | Wrong-direction interval per window | At least one wrong-direction interval in 14 daily checks |
|---|---:|---:|---:|
| IID, 14 readings | 83.0% | 17.0% | 75.0% |
| IID, 8 readings | 77.1% | 22.9% | 81.7% |
| AR(0.8), 14 readings | 53.5% | 46.5% | 96.7% |
| AR(0.8), 8 readings | 44.2% | 55.8% | 96.7% |
| Outliers, 8 readings | 76.3% | 23.7% | 86.7% |
| Persistent fluid step, 8 readings | 36.0% | 64.0% | 100.0% |
| AR(0.6), 8 readings, true loss | 57.5% | 1.8% | 11.7% |

For true zero, “wrong direction” means the interval excludes zero in either direction. For true negative loss, it means the interval lies wholly above zero. These are **diagnostic interval events, not calorie adjustments**: product tolerance, clinical eligibility, max-step rules, explicit acceptance, and post-acceptance cadence were not simulated. Therefore the repeated-check column must not be reported as a deployed app's false-adjustment probability. Windows overlap and are dependent; do not treat 840 windows as 840 independent trials or attach a naïve binomial confidence interval.

All 840 windows in each sparse scenario had at least one target block with fewer than three compatible donor blocks. That is reported as an observed degeneracy diagnostic, not an approved threshold. Complete results, including first-window coverage, mean interval width and point bias, are in `evaluation-results.json`.

## Conclusion and remaining gap

**Reject this configuration for operational use.** It undercovers even in the IID dense simulation, degrades sharply under correlation and fluid shifts, and produces frequent false directional signals across repeated evaluation. This is a measured failure of this experimental implementation/configuration; it is not a proof that all bootstrap methods fail.

There is no empirical participant-separated calibration/evaluation dataset, no population representativeness claim, and no validated observation/noise model. Residual stationarity, block adequacy, missingness assumptions, and inference about latent tissue trend versus fluid variation are unresolved. More bootstrap replicates alone do not fix those assumptions. Do not tune a multiplier on these same results and call that validation. A future candidate needs a prespecified independent evaluation protocol and real participant-separated evidence, with synthetic tests retained as stress tests.

## Reproduce

```sh
node --test residual-block-bootstrap.test.mjs
node run-evaluation.mjs
```

Five tests pass: deterministic seeds/output, calendar-gap preservation, exact linear trend/translation behavior, invalid-input rejection, and research-only output. A second complete evaluation reproduced the JSON SHA256 exactly. These tests establish implementation/reproducibility only, not statistical validity.
