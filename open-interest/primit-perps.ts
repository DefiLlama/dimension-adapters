import PromisePool from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_BASE = "https://api.primit.io";

// Primit's position ledger is off-chain. The Avalanche contracts custody collateral
// and emit audit events (TradeRecorder fills, Vault.PositionClosed) but hold no open
// position state, so open interest cannot be reconstructed from chain data.
// Docs: https://developers.primit.io/futures/usdt-margined/market-rest/open-interest
const fetch = async (_options: FetchOptions) => {
  const exchangeInfo = await httpGet(`${API_BASE}/fapi/v1/exchangeInfo`);
  const symbols: string[] = exchangeInfo.symbols
    .filter((market: any) => market.status === "TRADING")
    .map((market: any) => market.symbol);

  if (!symbols.length) throw new Error("Primit exchangeInfo returned no tradable symbols");

  const { results, errors } = await PromisePool.withConcurrency(5)
    .for(symbols)
    .process(async (symbol: string) => {
      const { openInterest } = await httpGet(`${API_BASE}/fapi/v1/openInterest?symbol=${symbol}`);
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

  return { openInterestAtEnd };
};

const methodology = {
  OpenInterest:
    "Sum of the USD notional of all open positions across every Primit market that is in TRADING status. The market list comes from GET /fapi/v1/exchangeInfo and each market's figure from GET /fapi/v1/openInterest, both public endpoints of Primit's Binance-compatible market data API. The values the endpoint returns are already USD notional, so no mark-price conversion is applied. Primit runs an off-chain matching engine and position ledger; its Avalanche contracts custody collateral and emit audit events but keep no on-chain position state, so open interest is not reconstructable from chain data. The endpoint publishes only the current figure, so each run records a snapshot taken at collection time rather than the state on a past date. Open interest covers all accounts holding positions, market makers included, as is standard for perpetual venues - note this is a wider scope than the volume reported by the primit-perps adapter, which counts only fills written on-chain by the TradeRecorder contract.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.AVAX],
  start: "2026-09-01",
  runAtCurrTime: true,
  methodology,
};

export default adapter;
