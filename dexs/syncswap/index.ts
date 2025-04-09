import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [CHAIN.ERA]: sdk.graph.modifyEndpoint('3PCPSyJXMuC26Vi37w7Q6amJdEJgMDYppfW9sma91uhj'),
  [CHAIN.LINEA]: sdk.graph.modifyEndpoint('9R6uvVYXn9V1iAxkTLXL1Ajka75aD7mmHRj86DbXnyYQ'),
  [CHAIN.SCROLL]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-scroll',
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon',
};


const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "syncSwapFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const [v2] = await Promise.all([graphs(chain)(options)])
    let dailyVolume = Number(v2.dailyVolume)
    return {
      dailyVolume: `${dailyVolume}`,
    }
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: '2023-03-23'
    },
    [CHAIN.LINEA]: {
      fetch: fetch(CHAIN.LINEA),
      start: '2023-07-19'
    },
    [CHAIN.SCROLL]: {
      fetch: fetch(CHAIN.SCROLL),
      start: '2023-10-17'
    },
    [CHAIN.SOPHON]: {
      fetch: fetch(CHAIN.SOPHON),
      start: '2024-12-16'
    }
  },
};

export default adapter;
