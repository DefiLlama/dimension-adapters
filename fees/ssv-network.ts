import { request } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

const config: Record<string, string> = {
  [CHAIN.ETHEREUM]: "https://api.studio.thegraph.com/query/88140/ssv-fee-tracker/version/latest",
};

const SSV_COINGECKO_ID = "ssv-network";
const SSV_TOKEN = "0x9D65fF81a3c488d585bBfb0Bfe3c7707c7917f54";
const BURN_ADDRESS = "0x0000000000000000000000000000000000000000";

const weiToSSV = (amount: string): Number => {
  return Number(amount || "0") / 1e18;
};

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const { createBalances, startTimestamp, getLogs } = options;

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
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  const result = await request(config[CHAIN.ETHEREUM], query);

  const data = result.dailyProtocolStats;
  
  // Convert wei amounts to SSV tokens using BigNumber for precision
  const totalFees = weiToSSV(data.dailyTotalFeesIncrease);
  const networkRevenue = weiToSSV(data.dailyNetworkEarningsIncrease);
  const operatorRevenue = weiToSSV(data.dailyOperatorEarningsIncrease);

  dailyFees.addCGToken(SSV_COINGECKO_ID, totalFees, 'Validator Operation Fees');
  dailyRevenue.addCGToken(SSV_COINGECKO_ID, networkRevenue, 'DAO Treasury Allocation');
  dailySupplySideRevenue.addCGToken(SSV_COINGECKO_ID, operatorRevenue, METRIC.OPERATORS_FEES);

  // Track token burns
  const burnLogs = await getLogs({
    target: SSV_TOKEN,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", "", BURN_ADDRESS],
  });

  for (const log of burnLogs) {
    // dailyRevenue.add(SSV_TOKEN, log.value, 'Token Burns');
    dailyHoldersRevenue.add(SSV_TOKEN, log.value, 'Token Burns');
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  UserFees: "Fees paid by stakers running validators through SSV network, consisting of operator fees (set by operators in a free market) and network fees (fixed by DAO). Paid in SSV tokens per block.",
  Fees: "Total fees collected from all validators operating on SSV network.",
  Revenue: "Network fees going to SSV DAO treasury for protocol development, governance, and ecosystem growth.",
  ProtocolRevenue: "Same as Revenue. Includes DAO treasury allocation and token burns.",
  SupplySideRevenue: "Operator fees earned by node operators running distributed validator infrastructure. Each operator sets their own fee in a free-market model.",
  HoldersRevenue: "Token burns that reduce supply and accrue value to SSV token holders.",
};

const breakdownMethodology = {
  Fees: {
    'Validator Operation Fees': 'Total fees paid by validators (operator fees + network fees)'
  },
  Revenue: {
    'DAO Treasury Allocation': 'Network fees allocated to SSV DAO (fixed cost per validator set by governance)',
  },
  SupplySideRevenue: {
    [METRIC.OPERATORS_FEES]: 'Fees earned by node operators (market-determined per validator)',
  },
  HoldersRevenue: {
    'Token Burns': 'SSV tokens burned to zero address',
  },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-06-18', // Based on SSV mainnet launch
  methodology,
  breakdownMethodology,
};

export default adapter;