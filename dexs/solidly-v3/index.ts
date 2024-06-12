import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ETHEREUM]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t",
  // [CHAIN.BASE]: "https://api.studio.thegraph.com/query/64631/solidly-v3-base/version/latest",
  [CHAIN.OPTIMISM]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t-optimism",
  [CHAIN.ARBITRUM]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t-arbitrum",
  [CHAIN.FANTOM]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t-fantom"
}, {
  factoriesName: "factories",
  dayData: "solidlyDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.ethereum.start = 1693526400;
export default adapters;
