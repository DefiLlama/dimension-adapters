import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.SONIC]: "https://subgraph.satsuma-prod.com/f6a8c4889b7b/clober/cpmm-v2-subgraph-sonic-mainnet/api"
}, {
    factoriesName: "sonicmarketFactories",
    totalVolume: "totalVolumeUSD",
    dayData: "dailySonicmarketStatistic",
    dailyVolume: "dailyVolumeUSD"
});
