import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.BSC]:
      sdk.graph.modifyEndpoint('B1VWKexyptT1ixDdHsxj3EJnAxvuje7ANT39rnfq9rRG'),
  },
  {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
  }
);
adapters.adapter.bsc.start = 1670113423;
export default adapters;
