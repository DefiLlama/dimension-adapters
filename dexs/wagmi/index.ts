import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/4540/wagmi-zksync-era/v0.05",
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/0xfantaholic/wagmi-fantom-backup"
}, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.era.start = async () => 1681257600;
adapters.adapter.fantom.start = async () => 1681603200;
export default adapters;
