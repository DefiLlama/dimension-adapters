import { SimpleAdapter, ChainEndpoints, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { ethers } from "ethers";

const v3Endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]:
    "https://subgraph.satsuma-prod.com/5d8f840fce6d/premia/premia-v3-arbitrum/api",
}

const v3StartTimes: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1692576000,
}

interface IGraphResponse {
  today: {
    premiumsUSD: string;
    exercisePayoutsUSD: string;
    feeRevenueUSD: string;
    protocolFeeRevenueUSD: string;
  };
  yesterday: {
    premiumsUSD: string;
    exercisePayoutsUSD: string;
    feeRevenueUSD: string;
    protocolFeeRevenueUSD: string;
  };
  factories: Array<{
    premiumsUSD: string;
    exercisePayoutsUSD: string;
    feeRevenueUSD: string;
    protocolFeeRevenueUSD: string;
  }>;
}

function toNumber(value: string): number {
  return Number(ethers.formatEther(value));
}

async function getV3Data(url: string, timestamp: number, options: FetchOptions) {
  const toBlock = await options.getToBlock()
  const fromBlock = await options.getFromBlock();
  const query = gql`
  {

      today:factories(first: 1, block:{number: ${toBlock}}) {
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
      yesterday:factories(first: 1, block:{number: ${fromBlock}}) {
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
      factories{
        premiumsUSD
        exercisePayoutsUSD
        feeRevenueUSD
        protocolFeeRevenueUSD
      }
  }
  `

  const response: IGraphResponse = (await request(url, query));

  const dailyFees = (toNumber(response.today?.feeRevenueUSD || '0') - toNumber(response.yesterday?.feeRevenueUSD || '0'));
  const dailyProtocolFees = (toNumber(response.today?.protocolFeeRevenueUSD || '0') - toNumber(response.yesterday?.protocolFeeRevenueUSD || '0'));

  if (dailyFees < 0) {
    throw new Error("Daily fees cannot be negative");
  }

  return {
    timestamp: timestamp,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: ((dailyFees) * .5),
    dailyProtocolRevenue: (dailyProtocolFees * 0.1),
    dailyHoldersRevenue: (dailyProtocolFees * 0.4),
  };
}

const adapter: SimpleAdapter = {
  methodology: {
    UserFees:
      "Traders pay taker fees on each trade up to 3% of the option premium.",
    ProtocolRevenue: "The protocol collects 10% of the taker fees.",
    SupplySideRevenue:
      "Liquidity providers collect 50% of the taker fees and earn revenue from market-making options.",
    HoldersRevenue: "vxPREMIA holders collect 40% of the taker fees.",
  },
  adapter: Object.keys(v3Endpoints).reduce((acc: any, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (ts: number, _t: any, options: FetchOptions) => await getV3Data(v3Endpoints[chain], ts, options),
        start: v3StartTimes[chain],
      },
    }
  }, {}),
}

export default adapter
