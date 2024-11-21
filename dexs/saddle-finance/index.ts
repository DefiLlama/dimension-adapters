import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";


const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('79UL5SaLLsbXqC8Ks6v3fwWHR1FRs636FFRHn55o5SWq'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AB2t32R1htdcguMQVVGt4biKGFeQ2HfXkEgJNkKi1dJa')
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(CHAIN.ARBITRUM),
      start: '2022-08-06',
    },
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: '2021-08-05',
    },
  },
};

export default adapter;
