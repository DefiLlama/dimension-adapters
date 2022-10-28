import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BSC]: "https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

adapter.adapter.bsc.start = async () => 1661156991;

export default adapter
