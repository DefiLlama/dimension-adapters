import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  const data = await fetchURL(
    `https://app.strikefinance.org/api/analytics/fees?from=${options.startTimestamp}&to=${options.endTimestamp}`
  );

  const dailyFees = options.createBalances()

  dailyFees.addUSDValue(data.totalFees, 'Trading Fees');
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    // V1 was an on-chain pool on Cardano. V2 (from 2026-03-20) runs matching, positions and
    // liquidations in the Strike node and Cardano only holds the deposit lockers (docs:
    // perpetuals/strike-node), so V2 fees are keyed as off_chain and the Cardano leg ends there.
    [CHAIN.CARDANO]: {
      fetch,
      start: "2025-05-16",
      deadFrom: "2026-03-20",
    },
    [CHAIN.OFF_CHAIN]: {
      fetch,
      start: "2026-03-20",
    },
  },
  allowNegativeValue: true,
  methodology: {
    Fees: "All trading fees collected by the platform.",
    Revenue: "All trading fees collected by the platform.",
    HoldersRevenue: "100% of all trading fees collected by the platform goes to $STRIKE holders.",
  },
  breakdownMethodology: {
    Fees: {
      "Trading Fees": "Fees collected from trades executed on the Strike Finance.",
    },
    Revenue: {
      "Trading Fees": "Fees collected from trades executed on the Strike Finance.",
    },
    HoldersRevenue: {
      "Trading Fees": "100% of all trading fees collected by the platform goes to $STRIKE holders.",
    },
  },
};

export default adapter;
