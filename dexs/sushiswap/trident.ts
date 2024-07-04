import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import {
  CHAIN,
} from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { FetchOptions } from "../../adapters/types";

const endpointsTrident: Record<string, string> = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('BSdbRfU6PjWSdKjhpfUQ6EgUpzMxgpf5c1ugaVwBJFsQ'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('FEgRuH9zeTRMZgpVv5YavoFEcisoK6KHk3zgQRRBqt51'),
  //[CHAIN.KAVA]: 'https://pvt.graph.kava.io/subgraphs/name/sushi-v2/trident-kava',
  // [CHAIN.METIS]: 'https://andromeda.thegraph.metis.io/subgraphs/name/sushi-v2/trident-metis',
  // [CHAIN.BITTORRENT]: 'https://subgraphs.sushi.com/subgraphs/name/sushi-v2/trident-bttc',
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('4x8H6ZoGfJykyZqAe2Kx2g5afsp17S9pn8GroRkpezhx'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('9TQaBw1sU3wi2kdevuygKhfhjP3STnwBe1jUnKxmNhmn'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('NNTV3MgqSGtHMBGdMVLXzzDbKDKmsY87k3PsQ2knmC1'),
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
