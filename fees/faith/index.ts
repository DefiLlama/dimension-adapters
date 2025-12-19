import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FaithStats {
  current: {
    volumeUsd24h: string;
    feesUsd24h: string;
  };
}

const fetch = async (options: FetchOptions) => {
  const url = `https://faith.gg/api/stats/protocol?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: FaithStats = await fetchURL(url);

  const dailyFees = Number(stats.current.feesUsd24h || 0);
  const dailyRevenue = Number(dailyFees * 0.1);
  const dailyProtocolRevenue = Number(dailyFees * 0.009) // 0.9% — Ops Vault (gas, infra, seasons, maintenance)
  const dailyHoldersRevenue = Number(dailyFees * 0.08); // 80% of revenue goes to burn and buybacks

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

/*

Every Test of Faith routes 10% of the total SUI pot into four on-chain vaults:

8% — FAITH Treasury (used for FAITH buybacks → 90% burn, 10% stakers)
1% — MANIFEST Treasury (MANIFEST buybacks)
0.1% — Pilgrimage Vault (SUI drips during Miracle droughts)
0.9% — Ops Vault (gas, infra, seasons, maintenance)

The remaining 90% of the pot always goes back to players — either to winners, or into protocol-controlled vaults when there are no winners. There is no hidden house edge beyond this explicit 10% routing.

*/

const methodology = {
  Fees: "10% protocol fee taken from deployed SUI during Tests of Faith over the requested day window.",
  Revenue: "All protocol fees collected by FAITH count as protocol revenue.",
  ProtocolRevenue: "0.9% — Ops Vault (gas, infra, seasons, maintenance)",
  HoldersRevenue: "80% of revenue goes to burn and FAITH buybacks",
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.SUI],
  fetch,
  start: "2025-11-24",
  methodology,
};

export default adapter;
