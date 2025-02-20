import * as sdk from "@defillama/sdk";
import { SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.CELO]: sdk.graph.modifyEndpoint('CcSNm5hBSGYk3WT1faPGDKBxHCdHkyyXYFujHC9DPtmY'),
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
    [CHAIN.CELO]: {
      fetch: graphs(CHAIN.CELO),
      start: '2021-11-10',
    },
  },
};

export default adapter;
