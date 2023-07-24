import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.LINEA]: "https://subgraph-mainnet.horizondex.io/subgraphs/name/horizondex/horizondex-mainnet-v2",
}, {
    factoriesName: "factories",
    dayData: "accumulatedDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
});

adapters.adapter.linea.start = async () => 1689373614;

export default adapters;
