import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.SYSCOIN]: "https://graph.pegasys.finance/subgraphs/name/pollum-io/pegasys"
  },
    factoriesName: "pegasysFactories",
    dayData: "pegasysDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SYSCOIN],
}

export default adapter;