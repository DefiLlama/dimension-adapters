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

// setting start time to day metropolis adapter was disabled + started tracking swapline
// after swapline acquisition of metropolis
adapter.adapter.fantom.start = async () => 1680048000;
export default adapter;
