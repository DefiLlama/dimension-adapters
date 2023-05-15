import { BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const v2adapters = univ2Adapter({
  [CHAIN.MOONBEAM]: "https://api.thegraph.com/subgraphs/name/stellaswap/stella-swap"
}, {});
v2adapters.adapter.moonbeam.start = async () => 1641960253;

const v3adapters = univ2Adapter({
  [CHAIN.MOONBEAM]: "https://api.thegraph.com/subgraphs/name/stellaswap/pulsar"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});
v3adapters.adapter.moonbeam.start = async () => 1672876800;

const adapter: BreakdownAdapter = {
  breakdown: {
    v2: v2adapters.adapter,
    v3: v3adapters.adapter
  }
}

export default adapter;
