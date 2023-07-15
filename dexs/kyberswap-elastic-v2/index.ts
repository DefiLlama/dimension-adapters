//
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ETHEREUM]: "https://ethereum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-ethereum-legacy",
  [CHAIN.BSC]: "https://bsc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bsc-legacy",
  [CHAIN.POLYGON]: "https://bsc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bsc-legacy",
  [CHAIN.AVAX]: "https://avalanche-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-avalanche-legacy",
  [CHAIN.ARBITRUM]: "https://arbitrum-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum-legacy",
  [CHAIN.OPTIMISM]: "https://optimism-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-optimism-legacy",
  [CHAIN.FANTOM]: "https://fantom-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-fantom-legacy",
  [CHAIN.BITTORRENT]: "https://bttc-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-bttc-legacy",
  [CHAIN.CRONOS]: "https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos-legacy",
  [CHAIN.VELAS]: "https://velas-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-velas-legacy",
  [CHAIN.OASIS]: "https://oasis-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-oasis-legacy",
}, {
  factoriesName: "factories",
  dayData: "kyberSwapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.ethereum.start = async () => 1654905600;
adapters.adapter.bsc.start = async () => 1654732800;
adapters.adapter.polygon.start = async () => 1654732800;
adapters.adapter.avax.start = async () => 1654905600;
adapters.adapter.arbitrum.start = async () => 1655942400;
adapters.adapter.optimism.start = async () => 1656460800;
adapters.adapter.fantom.start = async () => 1654732800;
adapters.adapter.bittorrent.start = async () => 1658188800;
adapters.adapter.oasis.start = async () => 1660780800;
adapters.adapter.cronos.start = async () => 1660780800;

export default adapters;
