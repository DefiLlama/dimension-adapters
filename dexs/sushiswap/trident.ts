import request, { gql } from "graphql-request";
import {
  CHAIN,
} from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { FetchOptions } from "../../adapters/types";

const endpointsTrident: Record<string, string> = {
  [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/sushi-v2/trident-polygon',
  [CHAIN.OPTIMISM]: 'https://api.thegraph.com/subgraphs/name/sushi-v2/trident-optimism',
  //[CHAIN.KAVA]: 'https://pvt.graph.kava.io/subgraphs/name/sushi-v2/trident-kava',
  [CHAIN.METIS]: 'https://andromeda.thegraph.metis.io/subgraphs/name/sushi-v2/trident-metis',
  [CHAIN.BITTORRENT]: 'https://subgraphs.sushi.com/subgraphs/name/sushi-v2/trident-bttc',
  [CHAIN.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/sushi-v2/trident-arbitrum',
  [CHAIN.BSC]: 'https://api.thegraph.com/subgraphs/name/sushi-v2/trident-bsc',
  [CHAIN.AVAX]: 'https://api.thegraph.com/subgraphs/name/sushi-v2/trident-avalanche',
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
      fetch: async (options: FetchOptions) => {
        const res = await request(endpointsTrident[chain], tridentQuery, {
          timestampHigh: options.endTimestamp,
          timestampLow: options.startTimestamp,
        });
        const daily = res.factoryDaySnapshots.find((snapshot: any) => {
          return snapshot.factory.type == "ALL"
        })
        return {
          totalVolume: res.factories[0]?.volumeUSD,
          totalFees: res.factories[0]?.feesUSD,
          totalUserFees: res.factories[0]?.feesUSD,
          dailyVolume: daily?.volumeUSD || 0,
          dailyFees: daily?.feesUSD || 0,
          dailyUserFees: daily?.feesUSD || 0
        }
      },
      start: getStartTimestamp({ ...startTimeQueryTrident, chain }),
    },
  }),
  {}
);

export default trident
