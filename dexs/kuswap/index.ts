import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.KCC]: "https://info.kuswap.finance/subgraphs/name/kuswap/swap",
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.KCC],
}

export default adapter;
