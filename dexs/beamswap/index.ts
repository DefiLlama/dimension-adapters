import { ChainEndpoints, BreakdownAdapter, BaseAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import customBackfill from "../../helpers/customBackfill";

const endpoints: ChainEndpoints = {
  [CHAIN.MOONBEAN]: "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-dex",
};


const graphs = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "dailyVolumeUSD",
  },
});

const v1graphs = getChainVolume({
  graphUrls: {
    [CHAIN.MOONBEAN]: "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-stable-amm",
  },
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  dailyVolume: {
    factory: "dailyVolume",
    field: "volume",
    dateField: "timestamp"
  }
});

const adapter: BreakdownAdapter = {
  breakdown: {
    classic: {
      [CHAIN.MOONBEAN]: {
        fetch: graphs(CHAIN.MOONBEAN),
        start: getStartTimestamp({
            endpoints,
            chain: CHAIN.MOONBEAN,
            dailyDataField: "uniswapDayDatas",
            dateField: "date",
            volumeField: "dailyVolumeUSD"
        }),
      },
    },
    "stable-amm": {
      [CHAIN.MOONBEAN]: {
        fetch: v1graphs(CHAIN.MOONBEAN),
        start: async () => 1656914570,
        customBackfill: customBackfill(CHAIN.MOONBEAN, v1graphs),
      },
    },
  }
}

export default adapter;
