import PromisePool from "@supercharge/promise-pool";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://api.primit.io";
// httpGet has no default timeout, so an unreachable host would hang the run.
const REQUEST_TIMEOUT = 10000;

// Primit's position ledger is off-chain. The Avalanche contracts custody collateral
// and emit audit events (TradeRecorder fills, Vault.PositionClosed) but hold no open
// position state, so open interest cannot be reconstructed from chain data.
//
// The endpoint returns USD notional (not a base-asset quantity), counts long and
// short notional together, and publishes only a live figure — so each run records a
// snapshot at collection time. It covers every account holding a position, market
// makers included, as is standard for perpetual venues.
//
// Docs: https://developers.primit.io/futures/usdt-margined/market-rest/open-interest
const fetch = async () => {
  const exchangeInfo = await httpGet(`${API_BASE}/fapi/v1/exchangeInfo`, { timeout: REQUEST_TIMEOUT });
  const symbols: string[] = exchangeInfo.symbols
    .filter((market: any) => market.status === "TRADING")
    .map((market: any) => market.symbol);

  if (!symbols.length) throw new Error("Primit exchangeInfo returned no tradable symbols");

  const { results, errors } = await PromisePool.withConcurrency(5)
    .for(symbols)
    .process(async (symbol: string) => {
      const { openInterest } = await httpGet(`${API_BASE}/fapi/v1/openInterest?symbol=${symbol}`, { timeout: REQUEST_TIMEOUT });
      const notional = Number(openInterest);
      if (!Number.isFinite(notional)) throw new Error(`Primit returned a non-numeric open interest for ${symbol}`);
      return notional;
    });

  // Open interest is a sum across every market, so dropping a failed symbol would
  // silently understate the headline figure. Fail the run instead and let the next
  // one pick it up.
  if (errors.length) throw new Error(`Primit open interest failed for ${errors.length}/${symbols.length} symbols: ${errors[0].message}`);

  // `openInterest` is already the USD notional of open positions (the venue sums
  // position size in USD server-side), so no mark-price conversion is applied.
  const openInterestAtEnd = results.reduce((sum: number, notional: number) => sum + notional, 0);

  // The endpoint answers 200 with "0" for a symbol it does not know, so a market
  // list that drifts out of sync would zero the sum without raising anything.
  if (!openInterestAtEnd) throw new Error("Primit reported zero open interest across all markets");

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  // The endpoint exposes only a live figure, so an hourly pull would re-read the
  // same snapshot and the slot aggregation would sum a point-in-time value.
  pullHourly: false,
  fetch,
  chains: [CHAIN.AVAX],
  // Later than dexs/primit-perps (2026-07-16): the endpoint serves only the
  // current figure, so nothing before this adapter went live can be recovered.
  start: "2026-09-01",
  runAtCurrTime: true,
};

export default adapter;
