import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FaithStats {
  current: {
    feesUsd24h: string;
  };
}

const fetch = async (options: FetchOptions) => {
  const url = `https://faith.gg/api/stats/protocol?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: FaithStats = await fetchURL(url);

  const dailyFees = Number(stats.current.feesUsd24h || 0);

  // All fees are collected into protocol-controlled vaults
  const dailyRevenue = dailyFees;
  const dailyProtocolRevenue = dailyFees;

  // Portion of fees earmarked for holder value (buyback/burn)
  // If 8% of volume goes to FAITH buyback/burn and fees are 10% of volume,
  // then this is 80% of fees.
  const dailyHoldersRevenue = dailyFees * 0.80;

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.SUI],
  fetch,
  start: "2025-11-24",
  methodology: {
    Fees: "10% fee taken from total SUI deployed into Tests of Faith over the requested day window (reported in USD).",
    Revenue: "All collected fees are counted as revenue.",
    ProtocolRevenue:
      "All fees are routed into protocol-controlled vaults (treasury + ops + other routing); counted as protocol revenue.",
    HoldersRevenue:
      "Portion of fees used for FAITH buyback/burn (8% of volume = 80% of fees).",
  },
};

export default adapter;
