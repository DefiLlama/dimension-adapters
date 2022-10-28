import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BITGERT]: "https://graph.icecreamswap.com/subgraphs/name/simone1999/bitgert-uniswap"
}, {});
adapters.adapter.bitgert.start = async () => 1655917200;

export default adapters;
