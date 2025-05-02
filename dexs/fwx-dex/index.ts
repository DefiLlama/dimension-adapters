import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.AVAX]:
      "https://subgraphs.fwx.finance/avac/subgraphs/name/fwx-exchange-avac",
    [CHAIN.BASE]:
      "https://subgraphs.fwx.finance/base/subgraphs/name/fwx-exchange-base-prod",
  },
  {
    factoriesName: "pancakeDayDatas",
    totalVolumeFilterParams: [
      {
        name: "id",
        type: "Int",
      },
    ],
    dayData: "pancakeDayData",
    hasDailyVolume: true,
  }
);

adapters.adapter.avax.start = 1717632000;
adapters.adapter.base.start = 1725408000;

export default adapters;
