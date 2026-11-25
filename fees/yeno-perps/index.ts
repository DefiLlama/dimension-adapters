import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// YeNo's Polymarket Perps builder profile address (public on Polymarket builder-stats).
// Max builder fee rate configured by YeNo: 0.1% (10 bps).
// https://api.perpetuals.polymarket.com/v1/info/builder-stats?address=0xB299BB58Be204DD53A080cE4798523f8771DaE27&period=1d
const YENO_PERPS_BUILDER = "0xB299BB58Be204DD53A080cE4798523f8771DaE27";
const BUILDER_STATS = `https://api.perpetuals.polymarket.com/v1/info/builder-stats?address=${YENO_PERPS_BUILDER}&period=1d`;

const BUILDER_FEES = "Polymarket Perps Builder Fees";

// Rolling 24h snapshot only — no historical day buckets from this endpoint.
export const fetch = async (options: FetchOptions) => {
  const stats = await fetchURL(BUILDER_STATS);
  const rows: any[] = Array.isArray(stats?.data) ? stats.data : [];

  let volume = 0;
  let builderFee = 0;
  for (const row of rows) {
    volume += Number(row.volume || 0);
    builderFee += Number(row.builder_fee || 0);
  }
  if (!Number.isFinite(volume) || volume < 0) {
    throw new Error(`yeno-perps: invalid volume from builder-stats (${volume})`);
  }
  if (!Number.isFinite(builderFee) || builderFee < 0) {
    throw new Error(`yeno-perps: invalid builder_fee from builder-stats (${builderFee})`);
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volume);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(builderFee, BUILDER_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume:
    "Rolling 24h USD notional of Polymarket Perps fills attributed to YeNo's builder address, from the public builder-stats API (period=1d). Each attributed fill is counted once (maker or taker for that builder order), including zero-builder-fee fills.",
  Fees:
    "Builder fees earned by YeNo on attributed Polymarket Perps fills (builder_fee), from the public builder-stats API. Excludes Polymarket exchange fees.",
  Revenue:
    "All Polymarket Perps builder fees attributed to YeNo are kept by YeNo.",
  ProtocolRevenue:
    "All Polymarket Perps builder fees attributed to YeNo are kept by YeNo.",
};

const breakdownMethodology = {
  Fees: {
    [BUILDER_FEES]:
      "Builder fees paid on Polymarket Perps fills tagged with YeNo's builder address.",
  },
  Revenue: {
    [BUILDER_FEES]:
      "Builder fees collected by YeNo from Polymarket Perps.",
  },
  ProtocolRevenue: {
    [BUILDER_FEES]:
      "Builder fees collected by YeNo from Polymarket Perps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  // builder-stats only exposes rolling windows (1d/1w/1m/…), not arbitrary hourly ranges
  pullHourly: false,
  fetch,
  runAtCurrTime: true,
  // Matching and fee accrual are off-chain; Polygon only sees deposits/withdrawals/state roots
  // (same venue model as dexs/polymarket-perps).
  chains: [CHAIN.OFF_CHAIN],
  // Approx. when YeNo Perps builder volume began; API has no day history so earlier days are not backfilled.
  start: "2026-10-01",
  doublecounted: true, // already counted in polymarket-perps venue volume
  methodology,
  breakdownMethodology,
};

export default adapter;
