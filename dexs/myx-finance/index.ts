import { ChainEndpoints, Fetch, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]: "https://api.myx.finance/v2/quote/market/contracts/arbitrum",
  [CHAIN.LINEA]: "https://api.myx.finance/v2/quote/market/contracts/linea",
  [CHAIN.OP_BNB]: "https://api.myx.finance/v2/quote/market/contracts/opbnb",
}

const methodology = {
  TotalVolume: "Total Volume from the sum of the open/close/liquidation of positions.",
  DailyVolume: "Daily Volume from the sum of the open/close/liquidation of positions.",
}

const getFetch = async (optios: FetchOptions) => {
  const result = await fetchURL(endpoints[optios.chain])

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((optios.endTimestamp * 1000)))
  const volume = result.data.reduce((acc, item) => {
    return acc + (item?.target_volume || 0)
  }, 0)

  return {
    timestamp: dayTimestamp,
    dailyVolume: volume || "0",
  }
}


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1706659200,
  [CHAIN.LINEA]: 1708473600,
  [CHAIN.OP_BNB]: 1727443900,
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: getFetch,
        start: startTimestamps[chain],
        meta: {
          methodology: methodology,
        },
      }
    }
  }, {})
}

export default adapter;
