import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/12332/koi-finance-v3/version/latest",
}, {
  factoriesName: "factories",
  dayData: "koiFinanceDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.ethereum.start = 32830523;
export default adapters;
