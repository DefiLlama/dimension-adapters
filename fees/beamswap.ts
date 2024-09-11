import * as sdk from "@defillama/sdk";
import { Adapter, ChainEndpoints } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import {
  DEFAULT_TOTAL_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../helpers/getUniSubgraph";

const endpoints: ChainEndpoints = {
  [CHAIN.MOONBEAN]: sdk.graph.modifyEndpoint(
    "9CwTvN5R8sztZSBZqbDZWcHZjM41RRiz63QmRMsJBn6X",
  ),
};

const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: DEFAULT_TOTAL_VOLUME_FACTORY,
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0.0013,
    UserFees: 0.0017,
  },
});

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch: graphs(CHAIN.MOONBEAM),
      start: getStartTimestamp({
        endpoints,
        chain: CHAIN.MOONBEAN,
        dailyDataField: "uniswapDayDatas",
        dateField: "date",
        volumeField: "dailyVolumeUSD",
      }),
    },
  },
};

export default adapter;
