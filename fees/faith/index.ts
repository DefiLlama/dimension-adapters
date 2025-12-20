import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FaithStats {
  current: {
    volumeUsd24h?: string; // optional
    feesUsd24h: string;
  };
}

const fetch = async (options: FetchOptions) => {
  const url = `https://faith.gg/api/stats/protocol?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: FaithStats = await fetchURL(url);

  const dailyFees = Number(stats.current.feesUsd24h || 0);
  const dailyRevenue = dailyFees;

  const dailyProtocolRevenue = Number(dailyFees * 0.09) // 0.9% — Ops Vault (gas, infra, seasons, maintenance)
  const dailyHoldersRevenue = Number(dailyFees * 0.8); // 80% of revenue goes to burn and buybacks

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
    Fees: "10% protocol fee taken from deployed SUI during Tests of Faith over the requested day window.",
    Revenue: "All protocol fees collected by FAITH count as revenue, which is 10% of volume.",
    ProtocolRevenue: "0.9% — Ops Vault (gas, infra, seasons, maintenance)",
    HoldersRevenue: "80% of revenue goes to burn and FAITH buybacks",
  }
};

export default adapter;
