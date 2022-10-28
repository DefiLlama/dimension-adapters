import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FUSE]: "https://api.thegraph.com/subgraphs/name/voltfinance/voltage-exchange"
}, {
});

export default adapters;
