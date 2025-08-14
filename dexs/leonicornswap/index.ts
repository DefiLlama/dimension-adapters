import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('ttjEWD8FZJecTZrHHhtiYnQtWhSmgtqqABU4pgAttaC')
  },
    factoriesName: "leonicornFactories",
    dayData: "leonicornDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.BSC],
  fetch,
}

export default adapter;