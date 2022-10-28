import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.KCC]: "https://info.kuswap.finance/subgraphs/name/kuswap/swap",
}, {
});

export default adapters;
