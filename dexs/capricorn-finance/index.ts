import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CUBE]: "https://info.capricorn.finance/subgraphs/name/cube/dex-subgraph"
}, {
  factoriesName: "hswapFactories",
  dayData: "hswapDayData",
});

adapters.adapter[CHAIN.CUBE].start = '2021-08-26';
adapters.adapter[CHAIN.CUBE].fetch = async (timestamp: number) => {
  return {
    dailyVolume: 0,
    timestamp,
  }
}

adapters.deadFrom = '2023-07-09';
export default adapters;
