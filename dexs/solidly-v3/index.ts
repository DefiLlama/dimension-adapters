import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const fetchGraph = univ2Adapter2({
  endpoints: {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t'),
    [CHAIN.SONIC]: sdk.graph.modifyEndpoint('6m7Dp7MFFLW1V7csgeBxqm9khNkfbn2U9qgADSdECfMA'),
    [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('HCThb3gJC45qUYmNEaYmZZTqJW3pSq7X6tb4MqNHEvZf'),
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ALCsbp7jWC6EQjwgicvZkG6dDEFGMV32QUZJvJGqL9Kx'),
    [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('HDNu25S2uqr13BHrQdPv2PfTpwxJgPB7QEnC8fsgKcM9')
  },
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
})

const fetch = async (options:FetchOptions) => {
  if (options.chain === CHAIN.BASE) {
    return await getUniV3LogAdapter({
      factory: '0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687'
    })(options)
  }
  const res = await fetchGraph(options)
  return {
    dailyVolume: res.dailyVolume,
  }
}

const adapters = {
  [CHAIN.ETHEREUM]: { start: '2023-08-18', fetch },
  [CHAIN.SONIC]: { start: '2024-12-17', fetch },
  [CHAIN.OPTIMISM]: { start: '2024-01-24', fetch },
  [CHAIN.ARBITRUM]: { start: '2024-01-24', fetch },
  [CHAIN.FANTOM]: { start: '2023-25-12', fetch },
  [CHAIN.BASE]: { start: '2024-01-24', fetch },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: adapters,
}

export default adapter;
