import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.DOGECHAIN]: "https://graph.yodeswap.dog/subgraphs/name/yodeswap"
}, {});

adapter.adapter[CHAIN.DOGECHAIN].start = 1630000000;
adapter.adapter[CHAIN.DOGECHAIN].fetch = async (timestamp: number) => { return { timestamp}};
export default adapter;
