import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
const adapter = univ2Adapter({
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/dfx-finance/dfx-v1",
    [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/dfx-finance/dfx-v1-polygon",
}, {
    factoriesName: "dfxfactories",
    totalVolume: "totalVolumeUSD",
    dayData: "dfxdayData",
    dailyVolume: "dailyVolumeUSD"
});
adapter.adapter.ethereum.start = async () => 1621418717;
adapter.adapter.polygon.start = async () => 1626861917;
export default adapter;
