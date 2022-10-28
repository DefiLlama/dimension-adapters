import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const adapter = univ2Adapter({
  [CHAIN.OKEXCHAIN]: "https://okinfo.cherryswap.net/subgraphs/name/cherryswap/cherrysubgraph"
}, {
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData",
});

adapter.adapter.okexchain.start = async () => 1627385129;
export default adapter;
