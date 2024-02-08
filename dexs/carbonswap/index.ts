
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ENERGYWEB]: "https://ewc-subgraph-production.carbonswap.exchange/subgraphs/name/carbonswap/uniswapv2",
}, {
});

adapters.adapter.energyweb.start = 1618446893;
export default adapters;
