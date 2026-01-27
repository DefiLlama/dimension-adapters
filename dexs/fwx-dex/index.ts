import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
    endpoints: {
    [CHAIN.AVAX]:
      "https://subgraphs.fwx.finance/avac/subgraphs/name/fwx-exchange-avac",
    [CHAIN.BASE]:
      "https://subgraphs.fwx.finance/base/subgraphs/name/fwx-exchange-base-prod",
  },
    factoriesName: "pancakeDayDatas",
    totalVolumeFilterParams: [
      {
        name: "id",
        type: "Int",
      },
    ],
    dayData: "pancakeDayData",
    hasDailyVolume: true,
  },
);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.AVAX]: { fetch, start: 1717632000 },
    [CHAIN.BASE]: { fetch, start: 1725408000 },
  },
}

export default adapter;
