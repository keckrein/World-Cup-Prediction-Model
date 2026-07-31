# Methodology

## What the model is

A transparent blend of an Elo rating system and de-vigged prediction-market and
sportsbook probabilities, fed into a Dixon-Coles Poisson goal model and a Monte
Carlo tournament simulation. On held-out historical World Cups, it performs on
par with the betting market. It does not demonstrate a market-beating edge.

## Pipeline

Five stages, each stage's output feeding the next:

1. Team strength on a common absolute Elo scale, blended from a team's own Elo
rating and a market-implied rating.
2. A venue-specific host bonus, added only when the host nation plays at home.
3. A Dixon-Coles Poisson goal model, converting strength into expected goals
and a scoreline grid.
4. A Monte Carlo tournament simulation (60,000 runs) with latent-strength
noise, producing championship, round-advancement, and per-match probabilities.
5. A live update layer: as real results arrive, Elo updates and progressively
takes over from the static pre-tournament signals, and market odds are
refreshed periodically.

The approach draws on established sports-analytics methods: a Poisson goal
model with a low-score correction (Dixon and Coles, 1997), team strength on an
Elo scale (Elo, 1978), and a ratings-based Poisson simulation of a World Cup
specifically (Dyte and Clarke, 2000). Forecast quality is assessed with proper
scoring rules (Brier, 1950; Epstein, 1969).

## Team strength

Each team's strength is a single absolute Elo rating, blended from two
estimates of the same underlying quantity: the team's own Elo rating and a
market-implied rating.

The market-implied rating maps a team's de-vigged implied win probability onto
the Elo scale via an empirically fitted relationship (ordinary least squares
on 254 team-match observations from the 2014, 2018, and 2022 World Cups,
R² = 0.64). The 254 observations are pooled snapshots, not 254 independent
teams, so the effective sample is smaller than the raw count suggests, closer
to 100-120 once within-tournament correlation is accounted for. The linear-in-
log-odds form is not an arbitrary choice; Elo rating differences are linear in
log-odds by construction. But a two-parameter fit on an effective N near 100
carries real uncertainty, and that uncertainty is the biggest single caveat on
the strength-estimation stage.

The default blend weights:

| Component | Weight |
|---|---|
| Elo rating (FIFA-history-derived) | 0.70 |
| Prediction markets (Polymarket/Kalshi) | 0.17 |
| Sportsbooks (de-vigged FanDuel) | 0.13 |
| Squad value / age / history | 0.00 each (removed by ablation) |

Squad market value, squad age, and historical World Cup pedigree were each
tested and dropped. Historical pedigree, for example, improved out-of-sample
score by only about 0.0005, below a pre-set 0.001 threshold for a signal to
earn its place. A signal has to earn its place with an out-of-sample number,
not a good story.

**The model's biggest acknowledged weakness lives here.** The market-implied
rating comes from outright-title odds, which price in a team's entire path to
the trophy, not just its head-to-head strength. Using outright odds as a
strength input imports some bracket-path information into a quantity that's
supposed to be path-independent. It's retained because outright odds are the
most liquid, publicly available market signal, and the out-of-sample test
still shows the blend adding real information over Elo alone. But this is the
first thing a version 2 of this model should fix, ideally with match-odds- or
advancement-odds-derived strength instead.

## Host advantage

A host bonus is added to a host nation's Elo only when it plays at home:
Mexico +110, USA +85, Canada +70. These are literature and judgment based, not
fit from 2026 host data (which didn't exist yet when the model was built).
Home advantage in football is well documented; the specific split favoring
Mexico over the USA and Canada is a judgment call, flagged as one. The Monte
Carlo samples each host edge as a distribution rather than a fixed value, so
this uncertainty propagates into the forecast instead of asserting false
precision.

## Goal model

Expected goals for each side use independent attack and defense terms, so the
product of the two teams' expected goals isn't held constant, a known failure
mode of naive Poisson goal models. Parameters are fit by maximum likelihood on
22,887 non-World-Cup international matches from 2002 onward. No World Cup
match is used to fit the parameters that are later graded on World Cups.

The scoreline probability applies the Dixon-Coles low-score correction to the
four lowest-scoring cells (0-0, 1-0, 0-1, 1-1), correcting a known tendency of
independent-Poisson models to misestimate low scores.

## Tournament simulation

Each group-stage match is simulated by sampling an actual scoreline from the
goal model, not by awarding expected points, so group qualification reflects
real outcome variance. Before each sampled match, team ratings are perturbed
with Gaussian noise, generating realistic upset frequencies endogenously
rather than through an ad-hoc shrink-toward-50% rule.

Knockout matches level after regulation are resolved by a penalty-shootout
model close to a coin flip, hard-capped so even a heavy favorite is at most
65/35. That cap matches the empirical record that strong teams lose shootouts
regularly.

**Continue-from-reality.** The simulation doesn't just run once at the start
and stay static. As real results come in, the engine finds the deepest
knockout round with known pairings, seeds every simulation there with the
real matchups, locks in the winners of matches already played, and samples
only what's left. Before any knockout match is played, it falls back to
simulating the full tournament, so the same code path covers the whole event.
This replaced an earlier version that re-simulated the entire bracket from
scratch on every call and ignored actual results entirely, a bug documented
in full in `model-history.md`.

## Live update layer

The machinery above is frozen once the tournament starts. Only inputs move:

- Each played match updates both teams' Elo, with a standard K-factor and
margin-of-victory multiplier.
- The static pre-tournament signals decay as matches accumulate, while the
Elo backbone, informed by actual results, grows in influence. Early in the
tournament the forecast leans on pre-tournament priors; late in the
tournament it leans on results.
- Market odds don't decay in weight, but a stale snapshot loses reliability,
so Elo's independent contribution scales up to fill the gap as the snapshot
ages. Markets are refreshed manually when a title contender has played since
the last snapshot, or the snapshot is four or more days old.

The live scorecard always grades the frozen pre-tournament forecast, never
the live updating one. Reported accuracy measures how the original
pre-tournament forecast held up against reality as the tournament actually
unfolded.

See `validation.md` for how well this actually performed, and `model-history.md`
for what broke and how it was fixed along the way.
