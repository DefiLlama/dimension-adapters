import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.SVM]: "https://subgraph.8gr.xyz/subgraphs/name/savmswap/savmswap",
}, {
  hasTotalVolume: false,
});

adapter.adapter.svm.start = 1711411200
export default adapter
