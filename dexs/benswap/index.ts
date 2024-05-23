import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.SMARTBCH]: "https://subgraphs.benswap.cash/subgraphs/name/bentokenfinance/bch-exchange"
}, {
  factoriesName: "benSwapFactories",
  dayData: "benSwapDayData",
});

adapters.adapter.smartbch.start = 1632326400;
export default adapters;
