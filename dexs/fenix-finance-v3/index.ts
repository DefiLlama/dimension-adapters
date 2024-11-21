import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  getChainVolume,
} from "../../helpers/getUniSubgraphVolume";

const endpointsAlgebraV3 = {
  [CHAIN.BLAST]:
    "https://api.goldsky.com/api/public/project_clxadvm41bujy01ui2qalezdn/subgraphs/fenix-v3-dex/ce3738b/gn",
};

const graphsAlgebraV3 = getChainVolume({
  graphUrls: endpointsAlgebraV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "algebraDayData",
    field: "volumeUSD",
    dateField: "date",
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BLAST]: {
      fetch: graphsAlgebraV3(CHAIN.BLAST),
    },
  },
};

export default adapter;

