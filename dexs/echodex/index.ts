import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.LINEA]: "https://graph-mainnet.echodex.io/subgraphs/name/echodex/core"
}, {
  factoriesName: "echodexFactories",
  dayData: "echodexDayData",
});


adapters.adapter.linea.start = async () => 1689638400;
export default adapters;
