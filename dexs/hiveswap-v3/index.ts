import {univ2Adapter} from "../../helpers/getUniSubgraphVolume";
import {CHAIN} from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
    endpoints: {
        [CHAIN.MAP]: "https://graph.mapprotocol.io/subgraphs/name/hiveswap/exchange-v3",
    },
    factoriesName: "factories",
    dayData: "pancakeDayData",
    dailyVolume: "volumeUSD"
});

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.MAP],
  fetch,
  start: 1706585489,
}

export default adapter
