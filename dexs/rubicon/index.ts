import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

// *** How do I marry these two ***?
const adapterOld = univ2Adapter({
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('B4cTJXyWHMLkxAcpLGK7dJfArJdrbyWukCoCLPDT1f7n'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('AUcAkUd4sJutFD3hYQfvB6uvXrEdYP26qiZwZ5qyrgTw')
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

adapterOld.adapter.arbitrum.start = 1686345120;
adapterOld.adapter.optimism.start = 1637020800;

// *** Picks up where the old leaves off ***
const adapterNew = univ2Adapter({
  [CHAIN.OPTIMISM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Optimism_V2',
  [CHAIN.ARBITRUM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Arbitrum_V2',
  [CHAIN.BASE]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Base_V2',
  [CHAIN.ETHEREUM]: 'https://graph-v2.rubicon.finance/subgraphs/name/Gladius_Metrics_Mainnet_V2',
}, {
  factoriesName: "rubicons",
  totalVolume: "total_volume_usd",
  dayData: "dayVolume",
  dailyVolume: "volume_usd",
  dailyVolumeTimestampField: "dayStartUnix"
});

// TODO: Could be more accurate to true start time at the end of adaptersOld
adapterNew.adapter.arbitrum.start = 183178326;
adapterNew.adapter.optimism.start = 116354792;
adapterNew.adapter.base.start = 10029602;
adapterNew.adapter.ethereum.start = 19361393;

export default adapterNew;