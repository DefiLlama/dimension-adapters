import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.IOTEX]: "https://graph.mimo.exchange/subgraphs/name/mimo/mainnet"
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: '2021-06-22'
      }
    }
  }, {})
};

export default adapter;
