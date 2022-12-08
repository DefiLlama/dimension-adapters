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
      dexAmmProtocols {
        cumulativeVolumeUSD
      }
      financialsDailySnapshots {
        dailyVolumeUSD
        timestamp
      }
    }
  `;
};

const methodology = {
  timeStamp: "Timestamp",
  dailyVolume: "Daily volume on the dex",
  totalVolume: "Total volume in USD",
};

const fetch = async () => {
  const response = await getGQLClient().request(getData());

  // Cumulative volume in USD
  const cumulativeVolumeUSD = Math.round(
    response.dexAmmProtocols[0].cumulativeVolumeUSD
  );

  // Calculating the total length of daily snapshots to determine the latest one
  const responseLength = response.financialsDailySnapshots.length;

  // Daily volume in USD
  const latestDailyVolumeUSD = Math.round(
    response.financialsDailySnapshots[responseLength - 1].dailyVolumeUSD
  );

  // Timestamp of the latest daily volume
  const timeStamp =
    response.financialsDailySnapshots[responseLength - 1].timestamp;

  return {
    timeStamp: timeStamp,
    dailyVolume: `${latestDailyVolumeUSD}`,
    totalVolume: `${cumulativeVolumeUSD}`,
  };
};

const adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: async () => 0,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;

// Test - yarn test dexs vapordex
