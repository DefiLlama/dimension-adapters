import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('7L3pXgL3sBVDkCjZjautaRjPr5u4dcUsG1KK6vj4XCec'),
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "zswapFactories",
  dayData: "zswapDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.AVAX],
  start: 1675814400,
}

export default adapter;
