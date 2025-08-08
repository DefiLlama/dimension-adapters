import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('HimtcQxxRnR2Uj4pq7EZQ3nUnhz8f5UJu7uax6WuYCGt')
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "factories",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1654992851,
}

export default adapter;
