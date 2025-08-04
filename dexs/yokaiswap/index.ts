import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.GODWOKEN]: "https://v0.yokaiswap.com/subgraphs/name/yokaiswap/exchange",
    [CHAIN.GODWOKEN_V1]: "https://www.yokaiswap.com/subgraphs/name/yokaiswap/exchange"
  },
  factoriesName: "yokaiFactories",
  dayData: "yokaiDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.GODWOKEN, CHAIN.GODWOKEN_V1],
}

export default adapter;