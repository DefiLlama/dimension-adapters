import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";


const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('79UL5SaLLsbXqC8Ks6v3fwWHR1FRs636FFRHn55o5SWq'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AB2t32R1htdcguMQVVGt4biKGFeQ2HfXkEgJNkKi1dJa')
};

const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(CHAIN.ARBITRUM),
      start: 1659750817,
    },
    [CHAIN.ETHEREUM]: {
      fetch: graphs(CHAIN.ETHEREUM),
      start: 1628128417,
    },
  },
};

export default adapter;
