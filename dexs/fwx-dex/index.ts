import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.AVAX]:
      "https://subgraphs.fwx.finance/avac/subgraphs/name/fwx-exchange-avac",
    [CHAIN.BASE]:
      "https://subgraphs.fwx.finance/base/subgraphs/name/fwx-exchange-base",
  },
  {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
  }
);
adapters.adapter.avax.start = 1717632000;
adapters.adapter.base.start = 1722988800;
export default adapters;
