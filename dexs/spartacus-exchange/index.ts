import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/spartacus-finance/spadexinfo",
};
const adapter = univ2Adapter(endpoints, {"gasToken" : "coingecko:fantom"});
adapter.adapter.fantom.start = 1650883041;

export default adapter
