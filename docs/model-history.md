# Model history

The forecasting machinery was frozen before the tournament started. Three
things changed mid-tournament, all at the data and grading layer, not the
model itself. A fourth thing was built, tested, and deliberately not shipped.
Each is documented here with what went wrong, what the fix was, and the
honest before/after.

## Shootout grading and live-Elo fix (June 30, 2026)

Two Round of 32 matches went to penalties. The grading function and the live
Elo updater both inferred the outcome from the regulation scoreline alone, so
a 1-1 decided on penalties looked identical to a genuine 1-1 draw. The winner
got no credit for winning; the scorecard didn't count the match as decisive
at all.

The fix adds an optional `pkWinner` field. When set, grading treats the
shootout winner as the actual winner, and live Elo gives real win/loss
credit, but at 0.4x the normal swing, since a shootout carries much less
signal about true team strength than 90 minutes of play. The stored scoreline
still shows the level regulation result; only the outcome label changes.

Re-grading the same match log with the fix applied moved the scorecard from
45/52 decisive (87%) to 45/54 (87%), and Brier from 0.099 to 0.114. Both got
worse, not better. The model had picked the wrong team in both shootouts. The
fix surfaced two real misses that had been sitting in the draw bucket — the
scorecard had been inflated by a measurement gap, and closing that gap was
always going to make the number look worse before it looked more accurate.

## The frozen baseline wasn't actually frozen (found July 2026)

A mid-tournament market refresh moved the live scorecard from 84% to 88%
decisive accuracy, with no new match results logged. That should be
impossible: the scorecard is supposed to grade a frozen pre-tournament
forecast, which can't move when the market moves.

The cause: the grading baseline was being recomputed from whatever the market
constants currently held, not from a stored snapshot. It had only looked
frozen because the market had never been refreshed mid-tournament before.
The guarantee was true in practice but not actually enforced in code.

The fix pins grading to immutable pre-tournament constants. This is the more
serious of the mid-tournament bugs, not because of the size of the error, but
because it affected the one mechanism meant to keep the self-assessment
honest: the scorecard could be inflated just by refreshing an input, with no
new results involved.

## Continue-from-reality simulation fix (July 14, 2026)

For most of the tournament, the Monte Carlo simulation re-ran the entire
bracket from scratch on every call, including matches that had already been
played. It never read the actual results. This was invisible while the top
contenders were still alive, and became glaring the night a top team was
eliminated: the model kept showing that team at roughly 27% to win the
tournament, and about 56% to reach a final it was no longer in.

A first fix attempt tried to pin the real winner of each actual matchup
inside the from-scratch simulation. It didn't work, because the bracket is
re-randomized every run, so the real matchups almost never recur in the same
slots to pin.

The actual fix changes what the simulation runs from. It finds the deepest
knockout round with known pairings, seeds every simulation there with the
real matchups, locks in the winners of matches already played, and only
simulates what's left. Before any knockout match is played, it falls back to
simulating the whole tournament, so one code path covers the full event. This
was the single most consequential fix of the tournament, because it's the
difference between a forecast that respects what has actually happened and
one that doesn't.

Writing the test suite for this fix caught a second bug immediately: teams
eliminated in *earlier* rounds were being shown with 0% probability of having
reached rounds they'd actually already reached and won. Nothing in the app
displayed those figures, so it was invisible, but it was wrong, and would
have surfaced the moment anything consumed that data. Fixed the same day.

## The market-weight decay: built, tested, withdrawn (July 2026)

The model's biggest acknowledged weakness is that team strength is partly
derived from outright-title odds, which bake in bracket path along with team
quality. As the knockout field narrows, path matters more. The hypothesis:
decay the market's weight as the field shrinks, and let Elo, which doesn't
know anything about bracket path, take up the slack.

Built it, then ran a controlled A/B test: same results, same Elo, same
market snapshot, decay toggled on or off. Every team's title probability
moved less than 0.3 percentage points, inside Monte Carlo noise. The market
and Elo were agreeing with each other, so reweighting between them changed
nothing.

An unvalidated parameter with no demonstrated effect doesn't belong in a
production forecast, so it was pulled. The code stays in the file, disabled,
in case the hypothesis is worth testing properly against historical
tournaments later. The reasoning behind it still holds up. That's not the
same as evidence it does anything, and evidence is the bar.

## A test suite that locks this in

`refresh_tests.js` runs **968** assertions checking that the engine can't
violate basic probabilistic guarantees: every probability stays in [0,1],
champion odds across all teams sum to 1, eliminated teams carry zero forward
probability, round-by-round probabilities never increase, and a fixed random
seed reproduces identical output. These aren't checks against expected
outputs. They're checks that the math is internally consistent, which is why
they caught the eliminated-team bug above the same day it was written.
