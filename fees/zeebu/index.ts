
import { request, gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Define target contracts and chains
const CONTRACTS = {
  [CHAIN.BASE]: ["0x330EDca5D02c454725db9c1384963f82b9fC8e47"],
  [CHAIN.BSC]: [
    "0x109722F4c9C9CB5059c116C6c83fe38CB710CBfB",
    "0xEEaf4Dc07ef08B7470B0e829Ed0a8d111737715B",
    "0x09d647A0BAFec8421DEC196A5cEe207fc7a6b85A",
    "0x9a47F91A6541812F88A026bdA2d372E22Ba4d7f7",
  ],
  [CHAIN.ETHEREUM]: ["0xE843115fF0Dc2b20f5b07b6E7Ba5fED064468AC6"],
};

const endpoints = {
  [CHAIN.BSC]: 'https://api.studio.thegraph.com/query/89152/fees_reward/version/latest',
  [CHAIN.BASE]: 'https://api.studio.thegraph.com/query/89152/fees_reward_base/version/latest',
}

interface GraphResponse {
  dayVolumeFeesAggregates: {
    contract: string;
    dailyFees: string;
    dailyVolume: string;
    dayID: string;
  }[];
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayID = (Math.floor(options.startOfDay / 86400)).toString();
  const graphQuery = gql`
    query ($dayID: String!) {
      dayVolumeFeesAggregates(
        orderBy: dayID
        orderDirection: desc
        where: { dayID: $dayID }
      ) {
        contract
        dailyFees
        dailyVolume
        dayID
      }
    }
  `;

  const url = endpoints[options.chain];
  const graphRes: GraphResponse = await request(url, graphQuery, { dayID: dayID });
  const aggregates = graphRes.dayVolumeFeesAggregates;
  const dailyFees = aggregates.reduce((sum, agg) => {
    const fee = agg.dailyFees ? (Number(agg.dailyFees) * 2) / 1e18 : 0;
    return sum + fee;
  }, 0);
  const dailyHoldersRevenue = dailyFees * 0.6 / 100;
  const dailyProtocolRevenue = dailyFees - dailyHoldersRevenue;

  return { 
    dailyFees, 
    dailyUserFees: dailyFees, 
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "2% collectively paid by merchant and customer",
  Revenue: "Invoice fees",
  ProtocolRevenue: "Protocol share from fees",
  HoldersRevenue: "Staking rewards earned by veZBU holders, 0.6% of collected fees ",
}

const adapter: SimpleAdapter = {
  methodology,
  adapter: {
    [CHAIN.BASE]: { fetch, start: 1728518400 },
    [CHAIN.BSC]: { fetch, start: 1688083200 },
  },
}

export default adapter;
