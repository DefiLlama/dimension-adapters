import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.CRONOS]: "https://infoapi.crodex.app/subgraphs/name/crograph2/crodex2"
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
}

export default adapter;