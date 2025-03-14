import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const data: any[] = (await queryDune("4751411", {
    start: options.startTimestamp,
    end: options.endTimestamp
  }));
  const dailyFees = data[0].total_fees;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyFees * (25/100)}`,
    dailyHoldersRevenue: `${(dailyFees * (25/100)) * (50/100)}`,
    dailyProtocolRevenue: `${(dailyFees * (25/100)) * (50/100)}`,
    dailySupplySideRevenue: `${dailyFees * (75/100)}`,
  }
};

const adapter = {
  version: 2,
  breakdown: {
    derivatives: {
      [CHAIN.SOLANA]: {
        fetch,
        runAtCurrTime: true,
        start: '2024-01-23',
      },
    },
  },
  isExpensiveAdapter: true,
};
export default adapter;

