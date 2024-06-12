// https://api.thegraph.com/subgraphs/name/camelotlabs/camelot-amm-2
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ARBITRUM]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7mPnp1UqmefcCycB8umy4uUkTkFxMoHn1Y7ncBUscePp"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.arbitrum.start = 1680220800;
export default adapters;
