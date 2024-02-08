import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/wingswap/wingswap-exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "wingSwapFactories",
  dayData: "wingSwapDayData",
  gasToken: "coingecko:fantom"
});

adapter.adapter.fantom.start = 1637452800;

export default adapter
