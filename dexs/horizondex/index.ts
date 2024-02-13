import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.LINEA]: "https://subgraph-mainnet.horizondex.io/subgraphs/name/horizondex/horizondex-mainnet-v2",
    [CHAIN.BASE]: "https://subgraph-base.horizondex.io/subgraphs/name/horizondex/horizondex-base-v2",
}, {
    factoriesName: "factories",
    dayData: "accumulatedDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
});

adapters.adapter.linea.start = 1689373614;
adapters.adapter.base.start = 1690894800;

export default adapters;
