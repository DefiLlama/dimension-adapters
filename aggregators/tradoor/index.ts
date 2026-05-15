import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const ENDPOINT = "https://tradoor0.xyz/api/admin/stats/daily_volume";
const START_DATE = "2026-05-03";

type SeriesRow = { date: string; volume_usd: number; fees_usd: number };
type StatsResponse = { days: number; series: SeriesRow[] };

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const day = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);

  // Window large enough to cover any backfill request.
  const res: StatsResponse = await fetchURL(`${ENDPOINT}?days=180`);
  const row = (res?.series || []).find((r) => r.date === day);

  return {
    dailyVolume: row ? row.volume_usd : 0,
    dailyFees: row ? row.fees_usd : 0,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: START_DATE,
    },
  },
  methodology: {
    Volume:
      "Sum of user-side notional traded by Tradoor user bots across the supported perpetual venues (Hyperliquid, Kinetiq HIP-3, Trade.xyz, Nado, Extended), denominated in USD, aggregated by UTC day. Each fill is counted once on the bot user's side (|px * sz| from user_fills_by_time for HL-side venues, balance delta for Nado); the counterparty leg is never added. One-sided, aggregator convention. Computed server-side from per-session pnl_history records attributed to Tradoor's builder code. Canonical source: https://tradoor0.xyz/api/admin/stats/daily_volume. Full methodology: https://tradoor0.xyz/docs#methodology",
    Fees:
      "Tradoor's gross fee share on maker volume, expressed in USD per UTC day. This is the protocol-side cut of the venue maker rebate, not the venue's own taker or maker fees. See https://tradoor0.xyz/docs#fees",
  },
};

export default adapter;
