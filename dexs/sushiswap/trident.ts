import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
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
  query trident($number: Int) {
    factory( 
      id: "ALL"
      block: { number: $number }
    ) {
      volumeUSD
      feesUSD
    }
  }
`

const trident = Object.keys(endpointsTrident).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: async ({ getStartBlock, getEndBlock }: FetchOptions) => {
        const [startBlock, endBlock] = await Promise.all([
          getStartBlock(),
          getEndBlock()
        ])
        const beforeRes = await request(endpointsTrident[chain], tridentQuery, {
          number: startBlock,
        });
        const afterRes = await await request(endpointsTrident[chain], tridentQuery, {
          number: endBlock,
        });

        return {
          totalVolume: afterRes.factory.volumeUSD,
          totalFees: afterRes.factory.feesUSD,
          totalUserFees: afterRes.factory.feesUSD,
          dailyVolume: afterRes.factory.volumeUSD - beforeRes.factory.volumeUSD,
          dailyFees: afterRes.factory.feesUSD - beforeRes.factory.feesUSD,
          dailyUserFees: afterRes.factory.feesUSD - beforeRes.factory.feesUSD
        }
      },
      start: getStartTimestamp({ ...startTimeQueryTrident, chain }),
    },
  }),
  {}
);

export default trident
