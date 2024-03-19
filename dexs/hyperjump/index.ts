import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/angry-mech/hyperjump-bsc-main",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "thugswapFactories",
  dayData: "thugswapDayData",
});

adapter.adapter.bsc.start = 1605139200;

export default adapter
