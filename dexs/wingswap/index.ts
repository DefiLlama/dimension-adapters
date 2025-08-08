import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('FQXGq9b1cWfrZVU4VVZyyRAgaLRQjUULE6YS26rkB1WM'),
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "wingSwapFactories",
  dayData: "wingSwapDayData",
  gasToken: "coingecko:fantom"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.FANTOM],
  start: 1637452800,
}

export default adapter;
