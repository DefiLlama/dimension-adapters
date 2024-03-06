import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/mkrman/exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "zswapFactories",
  dayData: "zswapDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

adapter.adapter.avax.start = 1675814400;

export default adapter
