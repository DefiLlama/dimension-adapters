import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/zyberswap-arbitrum/zyber-amm",
};
const adapter = univ2Adapter(endpoints, {});

adapter.adapter.arbitrum.start = async () => 1674432000;

export default adapter
