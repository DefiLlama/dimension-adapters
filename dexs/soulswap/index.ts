import * as sdk from "@defillama/sdk";
import { getChainVolumeWithGasToken2 } from "../../helpers/getUniSubgraphVolume";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { /*AVAX,*/ FANTOM } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  //[AVAX]: sdk.graph.modifyEndpoint('Ao7hF1zBTZ6pkotKPguC536KkU9Gi4DQLBZFkLR5NafN'),
  [FANTOM]: sdk.graph.modifyEndpoint('DftDSxq9ud7icPSKcEThpFLCgXd7Kx94ns8dK4Js63Fy'),
};

const VOLUME_FIELD = "volumeUSD";

const graphs = getChainVolumeWithGasToken2({
  graphUrls: {
    //[AVAX]: endpoints[AVAX],
    [FANTOM]: endpoints[FANTOM]
  },
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  priceToken: "coingecko:fantom"
});

const startTimeQuery = {
  endpoints,
  dailyDataField: "dayDatas",
  volumeField: VOLUME_FIELD,
};

const volume = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: graphs(chain as Chain),
      start: getStartTimestamp({ ...startTimeQuery, chain }),
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: volume,
};

export default adapter;