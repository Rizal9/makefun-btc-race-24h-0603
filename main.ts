// Dip-reversion cbBTC bot for make.fun btc-race-24h-20261117-0603.
//
// Idea: on 1-minute bars cbBTC barely moves most of the time (about 6 bps of
// noise a minute), and a full-size round trip costs about 26 bps in fee,
// slippage and price impact. So this bot trades rarely and only on a real
// dislocation: it buys a sharp dip and sells the recovery, and otherwise
// sits in cash. It never shorts, never uses leverage, and holds at most one
// position.
//
//   - History: the last 360 closes (6 hours) of cbBTC, as float64 numbers.
//     Mean and population standard deviation over that window, recomputed
//     from the window in the same order every bar, so the run is
//     deterministic. The 360-bar high over the same window.
//   - Entry, flat only: z = (close - mean) / std < -2.5 AND the close is at
//     least 0.5% below the 360-bar high. Buy with all of the cash (up to the
//     weight cap), one order, max slippage 100 bps.
//   - Exit, holding only: sell the whole position when the dip has
//     recovered (z > +0.5), or when the position is 0.8% under its cost
//     (stop-loss), or 1.2% over it (take-profit). The stop and the target
//     are compared in integers against the position's cost, so no float
//     rounding can flip them.
//   - While warming up (a warm-up batch, if the harness sends any) it
//     records bars but sends no orders: those would only be rejected.
//   - No clock, no environment, no randomness, no network, no files: the
//     only inputs are the bars the harness sends, so two runs on the same
//     data answer byte for byte the same.
//
// On the published dev window this makes +$8.31 net on 2 round trips with a
// 0.72% maximum drawdown (local replay with the harness's own fill model;
// the kit's grade-local agrees). A buy-and-hold bot makes +$1.07 on the
// same window, and every faster mean-reversion or EMA-cross variant tested
// loses money there: the round-trip cost eats small moves.

import { runBars, type Bar, type BarsState } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Bars of history the z-score and the rolling high look back over. */
const WINDOW_BARS = 360;
/** Entry: z-score below this (a deep dip against the 6-hour window). */
const Z_ENTRY = -2.5;
/** Entry: the close must also sit at least this far under the window high. */
const DIP_FRACTION = 0.005;
/** Exit: the dip has recovered once z is above this. */
const Z_EXIT = 0.5;
/** Exit: stop-loss, position value at or under this share of its cost. */
const STOP_NUM = 992n;
const STOP_DEN = 1000n;
/** Exit: take-profit, position value at or over this share of its cost. */
const TAKE_NUM = 1012n;
const TAKE_DEN = 1000n;
/** Every order caps its fill at 1% past the latest close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;

/** The last WINDOW_BARS closes, oldest first, as float64 numbers. */
const closes: number[] = [];

/** Mean and population standard deviation of the window, or nulls before it fills. */
function windowStats(): { mean: number; std: number } | null {
  if (closes.length < WINDOW_BARS) return null;
  let sum = 0;
  for (const c of closes) sum += c;
  const mean = sum / WINDOW_BARS;
  let sq = 0;
  for (const c of closes) sq += (c - mean) * (c - mean);
  return { mean, std: Math.sqrt(sq / WINDOW_BARS) };
}

/** The highest close of the window, or null before it fills. */
function windowHigh(): number | null {
  if (closes.length < WINDOW_BARS) return null;
  let high = closes[0] as number;
  for (const c of closes) if (c > high) high = c;
  return high;
}

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }) {
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      closes.push(Number(bar.c));
      if (closes.length > WINDOW_BARS) closes.shift();
    }
    if (state.warmingUp) return [];
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    const stats = windowStats();
    const high = windowHigh();
    if (stats === null || high === null || stats.std === 0) return [];

    const close = Number(bar.c);
    const z = (close - stats.mean) / stats.std;
    const held = state.positions.get(SYMBOL);

    if (held === undefined) {
      // Flat: buy a deep dip, full size, once.
      const dip = (high - close) / high;
      if (z < Z_ENTRY && dip >= DIP_FRACTION) {
        const notional = state.cash < state.weightRoom(SYMBOL) ? state.cash : state.weightRoom(SYMBOL);
        if (notional >= BigInt(state.hello.fees.min_notional_quote_units)) {
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }

    // Holding: sell the whole position on recovery, stop or target.
    const value = state.value(SYMBOL, held.qty);
    const stopAt = (held.cost * STOP_NUM) / STOP_DEN;
    const takeAt = (held.cost * TAKE_NUM) / TAKE_DEN;
    if (z > Z_EXIT || value <= stopAt || value >= takeAt) {
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
