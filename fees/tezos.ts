import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

/**
 * TEZOS Chain Fees Adapter
 * Fetches chain-level transaction fees (gas fees) for TEZOS blockchain
 * Uses Numia API which provides chain fees and revenue data for various chains
 * Note: This is different from protocol fees (DEX fees, DeFi fees, etc.)
 */

interface IChartItem {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const fetch = async (_a: any, _b: any, { dateString }: FetchOptions) => {
  const feeEndpoint = `https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue?chain=tezos`;
  const historicalFees: IChartItem[] = await fetchURL(feeEndpoint);

  const dayData = historicalFees.find((feeItem) => 
    feeItem.timestamp.split(' ')[0] === dateString
  );
  
  if (!dayData) {
    throw new Error(`No chain fees data found for ${dateString}`);
  }

  return {
    dailyFees: dayData.dailyFees,
    // dailyRevenue: dayData.dailyRevenue,
    dailyRevenue: 0, //Tezos fees go to validator only -> not counted as revenue 
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.TEZOS]: {
      fetch,
      start: '2018-06-30', // Tezos mainnet launch date
    },
  },
  protocolType: "chain" as any,
};

export default adapter;

