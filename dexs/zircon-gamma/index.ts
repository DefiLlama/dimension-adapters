import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.MOONRIVER]: "https://api.thegraph.com/subgraphs/name/reshyresh/zircon-alpha",
};

const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MOONRIVER],
  start: 1663200000,
}

export default adapter
