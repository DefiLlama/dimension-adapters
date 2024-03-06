import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/cone-exchange/cone",
};
const adapter = univ2Adapter(endpoints, {});
adapter.adapter.bsc.start = 1626677527;

export default adapter
