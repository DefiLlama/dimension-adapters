import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ETHEREUM]: "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2/latest/gn",
    [CHAIN.POLYGON]: "https://api.goldsky.com/api/public/project_clasdk93949ub0h10a9lf9pkq/subgraphs/dfx-v2-polygon/latest/gn",
  },
    factoriesName: "dfxfactoryV2S",
    totalVolume: "totalVolumeUSD",
    dayData: "dfxdayData",
    dailyVolume: "dailyVolumeUSD"
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: 1621418717 },
    [CHAIN.POLYGON]: { fetch, start: 1626861917 },
  },
}

export default adapter;
