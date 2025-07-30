import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.XLAYER]: "https://graph.revoswap.com/subgraphs/name/okx-mainnet/exchange",
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.XLAYER],
  start: 1713225600,
}

export default adapter;
