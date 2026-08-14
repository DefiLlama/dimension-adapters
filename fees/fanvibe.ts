import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// FanVibe public metrics endpoint documented at https://www.fanvibe.xyz/docs.
const API_URL = "https://xcup-fanvibe-production.up.railway.app/defillama/overview";

interface FanVibeOverview {
  timestamp: number;
  dailyVolumeUsd: number;
  dailyFeesUsd: number;
  dailyRevenueUsd: number;
  protocolFeeBps: number;
}

const fetch = async (options: FetchOptions) => {
  const data: FanVibeOverview = await httpGet(
    `${API_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`,
  );

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - data.timestamp) > 24 * 60 * 60) {
    throw new Error("FanVibe API data is stale");
  }
  // FanVibe charges a 0.5% protocol fee (50 bps) on accepted stakes per https://www.fanvibe.xyz/docs.
  if (data.protocolFeeBps !== 50) {
    throw new Error("Unexpected FanVibe protocol fee");
  }
  if (Math.abs(data.dailyFeesUsd - data.dailyRevenueUsd) > 0.01) {
    throw new Error(
      `FanVibe income statement mismatch: fees=${data.dailyFeesUsd} revenue=${data.dailyRevenueUsd}`,
    );
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyVolume.addUSDValue(data.dailyVolumeUsd);
  dailyFees.addUSDValue(data.dailyFeesUsd, "Stake Fees");
  dailyRevenue.addUSDValue(data.dailyRevenueUsd, "Stake Fees To Protocol");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.XLAYER],
  start: "2026-06-12",
  fetch,
  methodology: {
    Volume:
      "Gross accepted OKB stakes on FanVibe real World Cup match and champion markets. Rejected/refunded stake attempts are excluded.",
    Fees: "FanVibe applies a 0.5% protocol fee to accepted stakes.",
    Revenue: "Protocol revenue equals the 0.5% accepted-stake fee retained by FanVibe.",
    ProtocolRevenue: "100% of FanVibe protocol revenue is retained by the protocol.",
  },
  breakdownMethodology: {
    Fees: {
      "Stake Fees": "Protocol fee charged on accepted FanVibe stakes, equal to 0.5% of accepted stake volume.",
    },
    Revenue: {
      "Stake Fees To Protocol": "Protocol fee retained by FanVibe. FanVibe currently reports no supply-side revenue.",
    },
    ProtocolRevenue: {
      "Stake Fees To Protocol": "100% of FanVibe protocol revenue is retained by the protocol.",
    },
  },
};

export default adapter;
