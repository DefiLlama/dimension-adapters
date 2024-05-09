import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.XLAYER]: "https://graph.revoswap.com/subgraphs/name/okx-mainnet/exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});

adapter.adapter[CHAIN.XLAYER].start = 1713225600;


export default adapter
