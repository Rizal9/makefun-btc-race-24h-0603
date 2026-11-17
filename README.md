[![make.fun](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Rizal9/makefun-btc-race-24h-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Rizal9/makefun-btc-race-24h-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603)

# Dip-Reversion cbBTC Bot

A trading bot for the [make.fun bounty "Race a BTC trading bot live for 24 hours"](https://make.fun/bounty/btc-race-24h-20261117-0603): it trades Coinbase Wrapped BTC (cbBTC) against USDC minute by minute on on-chain prices, starting with $1,000 of paper money.

## Strategy

cbBTC moves only about 6 bps a minute most of the time, while a full-size round trip costs about 26 bps in fee, slippage and price impact — so this bot trades rarely and only on a real dislocation:

- **Entry (flat):** the close sits more than 2.5 standard deviations below its 360-bar (6-hour) mean **and** at least 0.5% below the 360-bar high → buy with all cash.
- **Exit (holding):** sell the whole position when the dip recovers (z-score back above +0.5), or at a 0.8% stop-loss, or at a 1.2% take-profit.

Long only, no leverage, at most one position, at most one order per bar. No clock, no environment, no randomness, no network, no files outside the repo — two runs on the same data give the same orders.

## Result on the dev window

Net **+$8.31** on 2 round trips, maximum drawdown 0.72% (local replay with the harness's own fill model; verified with the kit's `grade-local`). For comparison, buy-and-hold makes +$1.07 on the same window.

## Files

- `main.ts` — the bot (Node 22, standard library only, via the vendored shim)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's `bars-replay/v1` shim
- `LICENSE` — MIT
