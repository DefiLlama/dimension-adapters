import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
const adapter = univ2Adapter({
    [CHAIN.ETHEREUM]: "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2/latest/gn",
    [CHAIN.POLYGON]: "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2-polygon/latest/gn",
}, {
    factoriesName: "dfxfactoryV2S",
    totalVolume: "totalVolumeUSD",
    dayData: "dfxdayData",
    dailyVolume: "dailyVolumeUSD"
});
adapter.adapter.ethereum.start = 1621418717;
adapter.adapter.polygon.start = 1626861917;
export default adapter;
