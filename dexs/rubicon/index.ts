import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('B4cTJXyWHMLkxAcpLGK7dJfArJdrbyWukCoCLPDT1f7n'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('AUcAkUd4sJutFD3hYQfvB6uvXrEdYP26qiZwZ5qyrgTw')
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

adapters.adapter.arbitrum.start = 1686345120;
adapters.adapter.optimism.start = 1637020800;
export default adapters;