import { request } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const config: Record<string, string> = {
  [CHAIN.ETHEREUM]: "https://api.studio.thegraph.com/query/88140/ssv-fee-tracker/version/latest",
};

const SSV_COINGECKO_ID = "ssv-network";

const weiToSSV = (amount: string): Number => {
  return Number(amount || "0") / 1e18;
};

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const { createBalances, startTimestamp } = options;

  const date = new Date(getTimestampAtStartOfDayUTC(startTimestamp) * 1000);
  const dateString = date.toISOString().split('T')[0];

  const query = `
    query GetSSVDailyFees {
      dailyProtocolStats(id: "${dateString}") {
        id
        date
        dailyTotalFeesIncrease
        dailyOperatorEarningsIncrease
        dailyNetworkEarningsIncrease
      }
    }
  `;

  // Initialize all balance objects
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const result = await request(config[CHAIN.ETHEREUM], query);

  const data = result.dailyProtocolStats;
  
  // Convert wei amounts to SSV tokens using BigNumber for precision
  const totalFees = weiToSSV(data.dailyTotalFeesIncrease);
  const networkRevenue = weiToSSV(data.dailyNetworkEarningsIncrease);
  const operatorRevenue = weiToSSV(data.dailyOperatorEarningsIncrease);

  dailyFees.addCGToken(SSV_COINGECKO_ID, totalFees);
  dailyProtocolRevenue.addCGToken(SSV_COINGECKO_ID, networkRevenue);
  dailySupplySideRevenue.addCGToken(SSV_COINGECKO_ID, operatorRevenue);
  
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  UserFees: "Fees paid by stakers for using SSV network validator services. These fees are paid in SSV tokens for distributed validator operations.",
  Fees: "Fees collected by the SSV network from all validator operations. Includes both network fees and operator fees.",
  Revenue: "Portion of fees that goes to the SSV DAO treasury. This revenue is used for protocol development, governance, and ecosystem growth.",
  ProtocolRevenue: "Portion of fees that goes to the SSV DAO treasury. This revenue is used for protocol development, governance, and ecosystem growth.",
  SupplySideRevenue: "Fees distributed to SSV node operators who provide the infrastructure and run the validator services. This incentivizes decentralized participation.",
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-06-18', // Based on SSV mainnet launch
    },
  },
  methodology,
};

export default adapter;