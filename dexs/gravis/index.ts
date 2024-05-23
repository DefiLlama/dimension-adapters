
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/darth-crypto/gravis-finance",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/vkolerts/bsc-main"
}, {
});

adapters.adapter.polygon.start = 1622766258;
adapters.adapter.bsc.start = 1620174258;
export default adapters;
