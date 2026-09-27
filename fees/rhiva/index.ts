import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

interface Metrics {
  volume: number;
  userFees: number;
  protocolFees: number;
  transactions: number;
}

const RHIVA_ENDPOINT = "https://api.rhiva.fun/metrics/fees";

const fetch = async ({
  createBalances,
  fromTimestamp,
  toTimestamp,
}: FetchOptions) => {
  const amounts: Metrics = await postURL(
    RHIVA_ENDPOINT,
    {
      filter: {
        endTime: new Date(toTimestamp * 1000).toISOString(),
        startTime: new Date(fromTimestamp * 1000).toISOString(),
      },
    },
    3,
  );

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  dailyFees.addUSDValue(amounts.protocolFees + amounts.userFees, "Swap Fees");
  dailySupplySideRevenue.addUSDValue(amounts.userFees, "Referral Fees To Referrers");
  dailyRevenue.addUSDValue(amounts.protocolFees, "Swap Fees To Protocol");
  dailyProtocolRevenue.addUSDValue(amounts.protocolFees, "Swap Fees To Protocol");

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Portion of Rhiva fees retained by the protocol from liquidity provision activity.",
  },
  SupplySideRevenue: {
    "Referral Fees To Referrers": "Referral fee share paid to users who invite new participants.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Protocol share of Rhiva fees (~90%) collected by Rhiva.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "Protocol share of Rhiva fees (~90%) collected by Rhiva.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-09-11",
  fetch,
  pullHourly: true,
  methodology: {
    Fees: "Total fees from Rhiva liquidity provision activity, including referral and protocol shares.",
    SupplySideRevenue: "Referral fees paid to users who invite new participants.",
    Revenue: "Protocol share of Rhiva fees (~90%) collected by Rhiva.",
    ProtocolRevenue: "Protocol share of Rhiva fees (~90%) collected by Rhiva.",
  },
  breakdownMethodology,
};
export default adapter;
