import request, { gql } from "graphql-request";
import {
  CHAIN,
} from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const endpointsTrident: Record<string, string> = {
  [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/sushi-qa/trident-polygon',
  [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/sushi-qa/trident-optimism',
  //[CHAIN.KAVA]: 'https://pvt.graph.kava.io/subgraphs/name/sushi-qa/trident-kava', Graph node is stuck
  [CHAIN.METIS]: 'https://andromeda.thegraph.metis.io/subgraphs/name/sushi-qa/trident-metis',
  [CHAIN.BITTORRENT]: 'https://subgraphs.sushi.com/subgraphs/name/sushi-qa/trident-bttc',
  [CHAIN.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/sushi-qa/trident-arbitrum',
  [CHAIN.BSC]: 'https://api.thegraph.com/subgraphs/name/sushi-qa/trident-bsc',
  [CHAIN.AVAX]: 'https://api.thegraph.com/subgraphs/name/sushi-qa/trident-avalanche',
}

const VOLUME_FIELD = "volumeUSD";

const startTimeQueryTrident = {
  endpoints: endpointsTrident,
  dailyDataField: "factoryDaySnapshots",
  volumeField: VOLUME_FIELD,
};

const tridentQuery = gql`
  query trident($timestampLow: Int, $timestampHigh: Int) {
    factoryDaySnapshots(where: {date_gt: $timestampLow, date_lt: $timestampHigh}, first: 10) {
      date
      volumeUSD
      feesUSD
      factory {
        type
      }
    }
    factories(where: {type: "ALL"}) {
      volumeUSD
      feesUSD
      type
    }
  }
`

const trident = Object.keys(endpointsTrident).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: async (timestamp: number) => {
        const res = await request(endpointsTrident[chain], tridentQuery, {
          timestampHigh: timestamp,
          timestampLow: timestamp - 3600 * 24,
        });
        const daily = res.factoryDaySnapshots.find((snapshot: any) => {
          return snapshot.factory.type == "ALL"
        })
        return {
          timestamp: timestamp,
          totalVolume: res.factories[0]?.volumeUSD,
          totalFees: res.factories[0]?.feesUSD,
          totalUserFees: res.factories[0]?.feesUSD,
          dailyVolume: daily?.volumeUSD,
          dailyFees: daily?.feesUSD,
          dailyUserFees: daily?.feesUSD
        }
      },
      start: getStartTimestamp({ ...startTimeQueryTrident, chain }),
    },
  }),
  {}
);

export default trident
