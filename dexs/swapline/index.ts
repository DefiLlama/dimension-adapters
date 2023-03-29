import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/0xhans1/metropolis-v2",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "lbfactories",
  dayData: "traderJoeDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
  dailyVolumeTimestampField: "date"
});

adapter.adapter.fantom.start = async () => 1673827200;
export default adapter;
