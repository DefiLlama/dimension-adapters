import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
    endpoints: {
        [CHAIN.ENERGI]: "https://graph.energi.network/http/subgraphs/name/energi/energiswap"
    },
    factoriesName: "energiswapFactories",
    totalVolume: "totalVolumeUSD",
    dayData: "dailyEnergiswapStatistic",
    dailyVolume: "dailyVolumeUSD"
});

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ENERGI],
  fetch,
}

export default adapter;