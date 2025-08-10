import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.SMARTBCH]: "https://subgraphs.benswap.cash/subgraphs/name/bentokenfinance/bch-exchange"
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "benSwapFactories",
  dayData: "benSwapDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1632326400,
}

export default adapter;
