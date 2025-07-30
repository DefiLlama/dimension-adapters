// https://api.studio.thegraph.com/query/55584/zebra_scroll/0.6.2
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.SCROLL]: "https://api.studio.thegraph.com/query/55584/zebra_scroll/0.6.2",
};

const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SCROLL],
  start: 1698364800,
}

export default adapter
