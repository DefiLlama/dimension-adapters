import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.STEP]: "https://graph.step.network/subgraphs/name/stepapp/stepex"
  },
    factoriesName: "stepExFactories",
    dayData: "stepExDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STEP],
}

export default adapter;