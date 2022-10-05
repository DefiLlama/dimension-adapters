import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";


//TODO: add total volume from dexAmmProtocols
export default univ2Adapter({
    [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/messari/platypus-finance-avalanche",
}, {
    dayData: "financialsDailySnapshot",
    factoriesName: "dexAmmProtocol",
    totalVolume: "cumulativeVolumeUSD",
    dailyVolumeTimestampField: "timestamp",
    hasTotalVolume: false
});
