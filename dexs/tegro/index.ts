import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro',
  [CHAIN.POLYGON]: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-polygon',
  [CHAIN.AVAX]: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-avax',
  [CHAIN.BSC]: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-bnb',
  [CHAIN.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/ashtegro/tegro-arbitrum',
}, {
  factoriesName: "totalVolumes",
  dailyVolume: "volume",
  totalVolume: "volume",
  dayData: "dailyVolume"
});

adapters.adapter.ethereum.start = async () => (24 * 60 * 60) * 19600;
adapters.adapter.polygon.start = async () => (24 * 60 * 60) * 19600;
adapters.adapter.avax.start = async () => (24 * 60 * 60) * 19619;
adapters.adapter.bsc.start = async () => (24 * 60 * 60) * 19619;
adapters.adapter.arbitrum.start = async () => (24 * 60 * 60) * 19619;
export default adapters;
