import { gql, GraphQLClient } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

const graphQLClient = new GraphQLClient(
  "https://api.thegraph.com/subgraphs/name/mejiasd3v/vapordex-avalanche"
);

const getGQLClient = () => {
  return graphQLClient;
};

const getData = () => {
  return gql`
    query data {
      liquidityPools {
        totalValueLockedUSD
      }
      dexAmmProtocols {
        cumulativeVolumeUSD
      }
      protocols {
        cumulativeUniqueUsers
      }
      financialsDailySnapshots {
        dailyVolumeUSD
      }
    }
  `;
};

const methodology = {
  totalValueLocked: "Funds locked in liquidity pools",
  dailyVolume: "Daily volume on the dex",
  cumlativeVolume: "Total volume in USD",
  cumulativeUniqueUsers: "Unique users",
};

// Converts string[] to number[] and returns a sum of vals in the number[]
const calTVL = (res: string[]) => {
  const numRes: number[] = [];
  const length = res.length;
  for (let i = 0; i < length; i++) {
    numRes.push(parseInt(res[i]));
  }
  const TVL = numRes.reduce((partialSum, a) => partialSum + a, 0);
  return TVL;
};

const START_TIME = 1663584236;

const fetch = async () => {
  const response = await getGQLClient().request(getData());
  const res: string[] = response.liquidityPools.flatMap(
    (result: any) => result.totalValueLockedUSD
  );

  // Total value locked in the Dex pools
  const tvlUSD = calTVL(res);

  // Cumulative volume in USD
  const cumulativeVolumeUSD = Math.round(
    response.dexAmmProtocols[0].cumulativeVolumeUSD
  );

  // Cumulative unique users
  const cumulativeUniqueUsers = response.protocols[0].cumulativeUniqueUsers;

  // Calculating the total length of daily snapshots to determine the latest one
  const responseLength = response.financialsDailySnapshots.length;

  // Daily volume in USD
  const latestDailyVolumeUSD = Math.round(
    response.financialsDailySnapshots[responseLength - 1].dailyVolumeUSD
  );
  return {
    totalValueLocked: `${tvlUSD}`,
    dailyVolume: `${latestDailyVolumeUSD}`,
    cumulativeVolume: `${cumulativeVolumeUSD}`,
    cumulativeUniqueUsers: `${cumulativeUniqueUsers}`,
  };
};

const adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: async () => fetch(),
      start: async () => START_TIME,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;

// Test - yarn test dexs vapordex
