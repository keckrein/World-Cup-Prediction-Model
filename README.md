# World Cup 2026 Forecasting Model

I built a probabilistic forecasting system for the 2026 World Cup that combines Elo ratings, market information, a Dixon-Coles goal model, and Monte Carlo simulation—and then built a React application to expose the model's predictions, uncertainty, and live performance. Rather than claiming to beat the betting market, I focused on a more meaningful question: are the probabilities actually trustworthy? When the model says a team has a 70% chance of winning, does that team win roughly 70% of the time? The model is graded against that claim.

**Under the hood**: the model blends Elo with de-vigged prediction-market and sportsbook odds, feeds those strength estimates into a Dixon-Coles Poisson goal model, and uses Monte Carlo simulation to produce championship, round-advancement, and per-match probabilities.

The model was run live throughout the tournament — logging every result, updating its live ratings, and re-forecasting after each matchday — and its predictions were graded against a **frozen pre-tournament baseline** the entire way, so its scorecard reflects genuine out-of-sample performance rather than hindsight.

## Headline result

The model finished the 104-match tournament with:

| Metric | Value |
|---|---|
| Decisive-match accuracy | **69 / 82 (84%)** |
| Brier score | **0.114** |
| Champion prediction | **Spain (final pick 53%) — correct** |
| Calibration | No statistically detectable miscalibration (z = +0.69) |

**Out-of-sample RPS (lower is better)**: 0.2006 for Elo + market vs. 0.2082 for Elo alone and 0.2007 for the betting-market benchmark.

**Bottom line**: the model essentially matched the betting market rather than beating it.

## Screenshots

The screenshots below are from June 21, 2026: 48 of 104 matches in, before the field had narrowed. This captures the model with substantial uncertainty still on the table, which is closer to how the forecasting system actually operates.

![Forecast tab showing Spain at 22% mid-tournament, with round-by-round advancement odds](screenshots/forecast-overview-live.png)
*Championship odds at 48 matches played. Spain led at 22%, leaving 78% of the field still live — each team's path through the Round of 32, Round of 16, quarters, semis, and final is broken out separately.*

![Knockout bracket mid-tournament with live probabilities on unplayed matches](screenshots/bracket-knockout-live.png)
*The bracket view before the field had narrowed, showing per-match win probabilities for every remaining pairing.*

![Signal weights and evidence for what the model uses](screenshots/signal-weights-evidence.png)
*The model's core signals (Elo + market, 70/30) alongside ablation evidence for signals that were tested and dropped: squad value, squad age, and historical World Cup pedigree.*

![Results tab tracking 91% decisive accuracy at 48 matches](screenshots/results-live-tracking.png)
*Live scoring against the frozen pre-tournament forecast: match-by-match grading and the biggest live Elo shifts so far.*

![Final results tab showing 84% decisive accuracy and calibration breakdown](screenshots/results-calibration.png)
*The finished scorecard: 69/82 decisive matches correct, Brier 0.114, and the calibration table broken out by confidence bucket.*

Two more, outside the core forecasting loop:

![Scenarios tab with real-world event toggles repricing the model instantly](screenshots/scenario-modeling.png)
*Scenario presets: toggling real-world events (injuries, fitness doubts, home-crowd effects) reprices the model and Monte Carlo simulation instantly.*

![Bracket Sync tab auto-filling official FIFA Round-of-32 pairings from model predictions](screenshots/bracket-sync.png)
*Bracket Sync: automatically maps the model's group-stage predictions onto the official FIFA Round-of-32 structure, keeping the bracket synchronized without manual matchup entry.*

## What makes this project worth a look

- **An honest, frozen scorecard.** The live accuracy figure grades the *pre-tournament* forecast, not a model that quietly re-fits itself. A bug that briefly broke this guarantee is documented in full, including the before-and-after numbers. See `docs/model-history.md`.
- **A conditional Monte Carlo.** Once the knockouts begin, the simulation continues *from the actual bracket* rather than replaying the tournament from scratch, so eliminated teams correctly drop to zero probability. This was the single most important fix of the tournament run.
- **An executable specification.** A regression suite of **968 assertions** checks probabilistic invariants such as probability mass conservation, monotonicity, bracket propagation, and determinism.
- **A documented bug history.** Every significant fix — the shootout grading fix, the withdrawn market-decay experiment, the conditional Monte Carlo, the frozen-baseline bug — is written up with what went wrong, why it mattered, and what changed. See `docs/model-history.md`.

## Repository layout

```
.
├── README.md                     ← you are here
├── LICENSE
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx                  ← React entry point
│   └── worldcup2026.jsx          ← the model + app (single file)
├── docs/
│   ├── methodology.md            ← how the model works
│   ├── validation.md             ← out-of-sample results, calibration, limitations
│   └── model-history.md          ← every mid-tournament bug and fix
├── screenshots/                  ← app screenshots referenced above
├── refresh/
│   ├── refresh_gapcheck.js       ← lists scheduled matches missing results
│   ├── refresh_verify.js         ← pre-simulation sanity checks
│   ├── refresh_regen.js          ← grades results + regenerates the forecast
│   └── refresh_tests.js          ← 968-assertion regression suite
└── .github/workflows/deploy.yml  ← builds and deploys to GitHub Pages on push
```

## Running it locally

This is a Vite + React project.

```bash
npm install
npm run dev      # starts a local dev server
npm run build    # builds a production bundle to dist/
```

The tooling scripts in `refresh/` are plain Node.js. The tournament is complete, so these mainly serve to reproduce or re-verify the final numbers rather than to refresh anything live:

```bash
node refresh/refresh_gapcheck.js "Jul 19"   # confirms every match is logged (reports COMPLETE)
node refresh/refresh_regen.js 103 30000     # re-grades + re-simulates the completed tournament
node refresh/refresh_tests.js               # runs the 968-assertion regression suite
```

## How this was built: AI-assisted development

I used Claude as a development tool throughout the project, particularly for implementation, refactoring, and test generation. I retained responsibility for the modeling approach, evaluation design, specification, debugging, and analytical decisions. I independently reviewed the generated implementation and used regression tests and out-of-sample evaluation to verify its behavior.

In practice, I set the modeling approach, determined what constituted a bug versus a legitimate design choice, and made the calibration and shootout-handling judgment calls documented in [`docs/model-history.md`](docs/model-history.md). I also caught and corrected errors including a transposed scoreline, a bracket-propagation bug, and a frozen-baseline bug. Claude wrote and revised the implementation under that direction.

## A note on scope

This is an independent portfolio project exploring transparent forecasting under uncertainty. It is **not** a betting tool and makes no claim to beat the market. Its purpose is to demonstrate the process of specifying, building, evaluating, and maintaining a probabilistic forecasting system.

See [`docs/methodology.md`](docs/methodology.md) for how the model works and [`docs/validation.md`](docs/validation.md) for the full results, calibration analysis, and known limitations.
