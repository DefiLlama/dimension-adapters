/**
 * Bubblegum — prediction-market launchpad on Solana.
 * DeFiLlama Dimensions adapter (DEX volume).
 *
 * DATA SOURCE: the protocol indexer's read-only aggregate endpoint
 *   GET https://bgum-mainnet-indexer-production.up.railway.app/defillama/daily?date=YYYY-MM-DD
 * which sums that UTC day's SOL-denominated notional straight from the on-chain
 * -derived `trades` table (bonding-curve buys/sells + CPMM YES/NO swaps).
 *
 * Post-graduation Meteora pool swaps are NOT counted here — those belong to
 * Meteora's own adapter, not Bubblegum's launchpad volume.
 */
import { SimpleAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const INDEXER = "https://bgum-mainnet-indexer-production.up.railway.app/defillama/daily";
const SOL = "So11111111111111111111111111111111111111112"; // wSOL mint — priced as SOL

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  // v2: key the day window off dateString (YYYY-MM-DD, UTC), not startOfDay.
  const d = await fetchURL(`${INDEXER}?date=${options.dateString}`);

  const dailyVolume = options.createBalances();
  dailyVolume.add(SOL, d.volumeSolLamports ?? "0");

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  // The data source is a per-UTC-day aggregate endpoint (no intraday
  // granularity), so a single daily pull is correct — hourly polling would only
  // re-read the same daily bucket.
  pullHourly: false,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-05-13", // first mainnet deploy
  methodology: {
    Volume:
      "Daily SOL-denominated notional of bonding-curve buys/sells and CPMM YES/NO swaps, summed from the protocol's on-chain-derived trades table (gross sol_in + sol_out over buy/sell/swap; CPMM swaps persist their SOL-equivalent). Post-graduation Meteora pool swaps are excluded (counted under Meteora's own adapter).",
  },
};

export default adapter;
