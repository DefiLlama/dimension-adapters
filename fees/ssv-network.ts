import { request } from "graphql-request";
import { Adapter, FetchOptions, FetchResultFees, Chain } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import BigNumber from "bignumber.js";

const ENDPOINT = "https://api.studio.thegraph.com/query/88140/ssv-fee-tracker/version/latest";

// Query timeout in milliseconds
const QUERY_TIMEOUT = 30000;

interface DailyProtocolStats {
  id: string;
  date: string;
  dailyTotalFeesIncrease: string;
  dailyOperatorEarningsIncrease: string;
  dailyNetworkEarningsIncrease: string;
  activeOperators: number;
  lastUpdated: string;
}

interface GraphQLResponse {
  dailyProtocolStats: DailyProtocolStats | null;
}

/**
 * Converts wei amount to SSV tokens
 * @param amount - Amount in wei (string)
 * @returns BigNumber representing amount in SSV tokens
 */
const weiToSSV = (amount: string): BigNumber => {
  return new BigNumber(amount || "0").dividedBy(1e18);
};

/**
 * Queries the SSV subgraph for protocol fee data
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Promise resolving to GraphQL response
 */
const querySubgraph = async (dateString: string): Promise<GraphQLResponse> => {
  const query = `
    query GetSSVDailyFees {
      dailyProtocolStats(id: "${dateString}") {
        id
        date
        dailyTotalFeesIncrease
        dailyOperatorEarningsIncrease
        dailyNetworkEarningsIncrease
        activeOperators
        lastUpdated
      }
    }
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT);

  try {
    const result = await request(ENDPOINT, query);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

const fetch = async (_: any, _1: any, options: FetchOptions): Promise<FetchResultFees> => {
  const { createBalances, startTimestamp } = options;
  
  // Convert timestamp to UTC date string for subgraph query
  const date = new Date(getTimestampAtStartOfDayUTC(startTimestamp) * 1000);
  const dateString = date.toISOString().split('T')[0];

  // Initialize all balance objects
  const dailyUserFees = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  try {
    const response = await querySubgraph(dateString);
    
    if (!response.dailyProtocolStats) {
      // Return empty balances if no data found
      return {
        dailyUserFees,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        timestamp: startTimestamp,
      };
    }

    const data = response.dailyProtocolStats;
    console.log(data);
    
    // Convert wei amounts to SSV tokens using BigNumber for precision
    const totalFees = weiToSSV(data.dailyTotalFeesIncrease);
    const networkRevenue = weiToSSV(data.dailyNetworkEarningsIncrease);
    const operatorRevenue = weiToSSV(data.dailyOperatorEarningsIncrease);

    // Validate data consistency
    const calculatedTotal = networkRevenue.plus(operatorRevenue);
    const tolerance = new BigNumber(0.01); // 1% tolerance for rounding differences
    
    if (totalFees.gt(0) && calculatedTotal.dividedBy(totalFees).minus(1).abs().gt(tolerance)) {
      console.warn(`SSV fees data inconsistency detected for ${dateString}: 
        Total: ${totalFees.toString()}, 
        Network + Operator: ${calculatedTotal.toString()}`);
    }

    // Use CoinGecko ID for SSV token
    const SSV_COINGECKO_ID = "ssv-network";

    // Add balances - users pay all fees
    dailyUserFees.addCGToken(SSV_COINGECKO_ID, totalFees.toNumber());
    
    // Total fees collected by the protocol
    dailyFees.addCGToken(SSV_COINGECKO_ID, totalFees.toNumber());
    
    // Total revenue equals total fees in SSV Network's model
    dailyRevenue.addCGToken(SSV_COINGECKO_ID, totalFees.toNumber());
    
    // Protocol revenue goes to SSV DAO treasury
    dailyProtocolRevenue.addCGToken(SSV_COINGECKO_ID, networkRevenue.toNumber());
    
    // Supply side revenue goes to node operators
    dailySupplySideRevenue.addCGToken(SSV_COINGECKO_ID, operatorRevenue.toNumber());
    
    // No direct revenue distribution to SSV token holders
    // Token holders benefit through governance and potential token appreciation

    return {
      dailyUserFees,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      timestamp: startTimestamp,
    };

  } catch (error) {
    // Log error for debugging but return empty balances to avoid breaking the adapter
    console.error(`SSV Network adapter error for ${dateString}:`, error);
    
    return {
      dailyUserFees,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
      timestamp: startTimestamp,
    };
  }
};

const methodology = {
  UserFees: "Fees paid by stakers for using SSV network validator services. These fees are paid in SSV tokens for distributed validator operations.",
  Fees: "Total fees collected by the SSV network from all validator operations. Includes both network fees and operator fees.",
  Revenue: "Total revenue generated by the SSV protocol, which equals the total fees collected as all fees flow through the network.",
  ProtocolRevenue: "Portion of fees that goes to the SSV DAO treasury. This revenue is used for protocol development, governance, and ecosystem growth.",
  SupplySideRevenue: "Fees distributed to SSV node operators who provide the infrastructure and run the validator services. This incentivizes decentralized participation.",
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-06-18', // Based on SSV mainnet launch
      meta: {
        methodology
      }
    },
  },
};

export default adapter; 