import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.ENERGYWEB]: "https://ewc-subgraph-production.carbonswap.exchange/subgraphs/name/carbonswap/uniswapv2",
};

const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1618446893,
}

export default adapter;
