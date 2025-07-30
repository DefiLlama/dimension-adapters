import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/echodex/exchange-v3-2"
  },
  factoriesName: "factories",
  dayData: "echodexDayData",
  dailyVolume: "volumeUSD",
});


const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.LINEA]: { fetch, start: 1689638400 },
  },
}

export default adapter;