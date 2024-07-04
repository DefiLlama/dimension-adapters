import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.JBC]: "https://graph.jibswap.com/subgraphs/name/jibswap",
}, {});

adapters.adapter.jbc.start = 1702494791;

export default adapters;
