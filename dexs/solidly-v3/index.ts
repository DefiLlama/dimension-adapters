import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { FetchOptions, FetchV2 } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const adapters = univ2Adapter2({
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t'),
  [CHAIN.SONIC]: sdk.graph.modifyEndpoint('6m7Dp7MFFLW1V7csgeBxqm9khNkfbn2U9qgADSdECfMA'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('HCThb3gJC45qUYmNEaYmZZTqJW3pSq7X6tb4MqNHEvZf'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ALCsbp7jWC6EQjwgicvZkG6dDEFGMV32QUZJvJGqL9Kx'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('HDNu25S2uqr13BHrQdPv2PfTpwxJgPB7QEnC8fsgKcM9')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.ethereum.start = '2023-08-18';
adapters.adapter.sonic.start = '2024-12-17';
adapters.adapter.optimism.start = '2024-01-24';
adapters.adapter.arbitrum.start = '2024-01-24';
adapters.adapter.fantom.start = '2023-25-12';

// Store original fetch functions and create wrapper
const chains = ['ethereum', 'sonic', 'optimism', 'arbitrum', 'fantom'] as const;
const originalFetches = new Map(
  chains.map(chain => [chain, adapters.adapter[chain].fetch])
);

const wrapFetchWithZeroTotal = (originalFetch: FetchV2) => {
  return async (options: FetchOptions) => {
    const res = await originalFetch(options);
    return {
      dailyVolume: res.dailyVolume,
    };
  };
};

// Apply wrapper to all chains
chains.forEach(chain => {
  adapters.adapter[chain].fetch = wrapFetchWithZeroTotal(originalFetches.get(chain) as FetchV2);
});

adapters.adapter[CHAIN.BASE] = {
  fetch: async (options: FetchOptions) => {
    const res = await getUniV3LogAdapter({
      factory: '0x70fe4a44ea505cfa3a57b95cf2862d4fd5f0f687'
    })(options)
    return {
      dailyVolume: res.dailyVolume,
    }
  },
  start: '2024-01-24'
}

export default adapters;
