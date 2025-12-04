import { FetchOptions, SimpleAdapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

/**
 * Fetches Algorand blockchain transaction fees using AlgoNode's public API
 * and aggregates them for the given time period
 */
const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  // Convert to ISO format for the API
  const startDate = new Date(startTimestamp * 1000).toISOString();
  const endDate = new Date(endTimestamp * 1000).toISOString();
  
  let totalFees = 0;
  let nextToken: string | undefined = undefined;
  let requestCount = 0;
  const MAX_REQUESTS = 100; // Safety limit to prevent infinite loops
  
  try {
    // Query transactions from AlgoNode public indexer (more reliable)
    do {
      let url = `https://mainnet-idx.algonode.cloud/v2/transactions?after-time=${startDate}&before-time=${endDate}&limit=1000`;
      if (nextToken) {
        url += `&next=${nextToken}`;
      }

      const response = await httpGet(url);
      const txns = response.transactions || [];

      // Sum all transaction fees (fees are in microAlgos)
      for (const txn of txns) {
        if (txn.fee && typeof txn.fee === 'number') {
          totalFees += txn.fee;
        }
      }

      nextToken = response['next-token'];
      requestCount++;
      
      // Safety checks
      if (!nextToken || txns.length === 0 || requestCount >= MAX_REQUESTS) {
        break;
      }
    } while (nextToken);

    const dailyFees = options.createBalances();
    // Convert from microAlgos to ALGO (1 ALGO = 1,000,000 microAlgos)
    dailyFees.addCGToken('algorand', totalFees / 1e6);

    return {
      dailyFees,
      dailyRevenue: dailyFees, // All transaction fees on Algorand are burned
    };
  } catch (error) {
    // If the indexer fails, return 0 rather than crashing
    console.error('Error fetching Algorand fees:', error);
    const dailyFees = options.createBalances();
    dailyFees.addCGToken('algorand', 0);
    return {
      dailyFees,
      dailyRevenue: dailyFees,
    };
  }
};

const methodology = {
  Fees: "All transaction fees paid by users on the Algorand blockchain",
  Revenue: "All transaction fees on Algorand are burned, effectively benefiting all ALGO holders through reduced supply"
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch,
      start: '2019-06-11', // Algorand mainnet launch date
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;
