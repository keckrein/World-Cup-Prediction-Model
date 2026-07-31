# Validation

## Out-of-sample fitting protocol

Goal-model parameters are fit on 22,887 non-World-Cup international matches
from 2002 onward. World Cup matches are reserved entirely for testing; none
are used in fitting. On 132 held-out World Cup matches (2014, 2018, 2022),
comparing strength sources by Ranked Probability Score (lower is better):

| Strength source | RPS |
|---|---|
| Elo only | 0.2082 |
| Elo + Market (this model, 70/30) | 0.2006 |
| Market only | 0.2072 |
| Betting market (benchmark) | 0.2007 |

Adding the market component to Elo is a real improvement: bootstrapped, the
blend beats Elo-only 95.8% of the time. The market carries information that
isn't redundant with Elo.

The blend lands at parity with the betting market: 0.2006 versus 0.2007, and
the model beats the market in only 50.7% of bootstrap draws, a statistical
dead heat. The honest conclusion is that this model performs on par with the
betting market out-of-sample. Neither reliably beats the other. An earlier
in-sample figure that looked like it beat the market was optimistic, because
the goal model had been fit and graded on the same matches. The out-of-sample
numbers above are the trustworthy ones.

## Final scorecard (all 104 matches, 2026 tournament)

| Metric | Value |
|---|---|
| Decisive-match accuracy | 69 / 82 (84%) |
| Draws (not charged against decisive accuracy) | 22 |
| Brier score | 0.114 |
| Calibration | no detectable miscalibration (z = +0.69, team-clustered) |
| Champion called | yes, Spain, the model's 53% pre-final pick |
| Shootouts | 1 for 4 |
| Third-place match | missed (favored France; England won) |

This grades the frozen pre-tournament forecast, not a model that quietly
re-fits itself as the tournament unfolds. Decisive accuracy counts only
matches where the model named a clear favorite; a favorite-versus-favorite
forecast doesn't call a draw, so draws are excluded rather than counted
against it. Shootout-decided matches are graded as decisive, not folded into
the draw bucket (see `model-history.md` for why that distinction needed a
fix mid-tournament).

The final call landed: Spain at 53% in a near-coin-flip, and Spain won 1-0
after extra time. That's one correct coin flip, not evidence the model has
an edge, but it's the call the frozen model actually made going in.

The model went 1-for-4 on shootouts and missed the third-place game. Both are
consistent with the model's own design: shootouts are deliberately modeled as
close to a coin flip, and a dead-rubber third-place game is exactly the
low-stakes, high-variance setting a strength model has the least to say
about.

## Calibration

Accuracy asks whether the favorite was right. Calibration asks the sharper
question: when the model says 70%, do those teams actually win about 70% of
the time? A model can be accurate and still overconfident, which accuracy and
Brier score alone won't reveal.

Across the 82 decisive matches, the model won 69. Under the assumption that
the model is calibrated, the expected number of wins is 66.0. The naive
standard deviation (3.36) assumes independent matches, which understates the
real uncertainty: a team's true strength is shared across every match it
plays, so if the model misjudges a team, it misjudges every match that team
is in. Bootstrapping by resampling whole teams rather than individual matches
widens the standard deviation to 4.34.

At that clustered standard deviation, the result sits at z = +0.69: no
statistically detectable miscalibration. That is a weaker and more accurate
claim than "the model is calibrated." With only 82 matches from one
tournament, a real miscalibration of five percentage points would probably
still pass this test undetected. The result is a diagnostic, not a clean
bill of health, and it's reported as one.

| Model said | n | Predicted rate | Actual rate | Consistent with calibration? |
|---|---|---|---|---|
| 50-60% | 9 | 56.0% | 66.7% | yes |
| 60-70% | 11 | 65.2% | 72.7% | yes |
| 70-80% | 19 | 75.2% | 68.4% | yes |
| 80-90% | 17 | 86.3% | 100.0% | yes |
| 90-100% | 26 | 95.6% | 96.2% | yes |

The 80-90% bucket going 17-for-17 looks striking. It isn't: the confidence
interval on that bucket runs from 82% to 100%, so a true rate of 86% fits
comfortably. Small buckets carry little information, and this test has low
power by design. Its value comes from repeating it across many historical
tournaments, where the sample is large enough for the test to actually bite.

## The Spain-France divergence

For most of the group stage, both prediction markets and sportsbooks favored
France after Spain was held to a scoreless draw by Cape Verde, while the
model kept Spain narrowly ahead. This looked like it might be the model
usefully resisting a market overreaction to one draw.

It didn't hold up. France won all six of its matches and reached the
semifinal without going to extra time, the only side in the tournament to do
so. The market's early preference for France looks better calibrated than the
model's early preference for Spain. The model eventually came around to agree
with the market, but only after a market refresh injected 18 days of
information at once, not through its own Elo-driven signal. A controlled test
isolating the market's contribution confirmed France's lead wasn't a market
artifact; the timing of the crossover was about the refresh, not new
information the model had independently picked up.

One data point isn't evidence of a systematic model deficiency, any more than
the reverse would have been evidence of an edge. It's worth including because
it looked like a point in the model's favor partway through, and the honest
follow-up is that it didn't pan out that way.

## Known limitations, ranked by likely impact

1. **Strength is derived in part from outright-title odds**, which mix team
quality with tournament position (bracket path, group difficulty, host
location). This is the largest limitation. A mitigation (decaying the
market's weight as the knockout field narrows) was built and tested; it had
no measurable effect and was withdrawn rather than shipped unvalidated. See
`model-history.md`.
2. **Attack and defense are forced from a single Elo number**, not estimated
per team. A defensively strong but low-scoring team isn't distinguished from
a balanced team of the same overall rating.
3. **Validation uses the market as both an input and the benchmark.** The
Elo-only-versus-blend contrast partially isolates the non-market
contribution, but a fully clean test (lagged market snapshots, one
bookmaker as input and another as benchmark) would be stronger, and wasn't
run because the project doesn't store historical intraday odds.
4. **The market-to-Elo mapping is calibrated on a modest effective sample**
(roughly 100-120 independent observations), for the single most load-bearing
transformation in the model.
5. **Host advantage is judgment-based**, not fit from host-nation data, though
it's now sampled as a distribution rather than asserted as an exact value.
6. **Small live sample.** Scorecard figures rest on around a hundred matches
and are correspondingly noisy, especially for shootout-specific claims: four
shootouts isn't enough to say anything meaningful about whether the model's
shootout-adjacent Elo handling is well-calibrated.
7. **Manual market refresh and manual injury entry** introduce human-in-the-
loop timing effects. Injuries are largely left for the market to price, to
avoid double-counting, so a very recent injury not yet reflected in the
market isn't separately modeled.
8. **One unvalidated heuristic remains in production**: the 0.4x shootout Elo
damping. A second heuristic (the market-weight decay) was tested and
withdrawn for lack of measurable effect. The standard going forward is that
no unvalidated parameter ships without a demonstrated effect.
