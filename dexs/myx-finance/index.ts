import { ChainEndpoints, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const endpoints: ChainEndpoints = {
  [CHAIN.ARBITRUM]: "https://api-arb.myx.finance/coingecko/contracts",
  [CHAIN.LINEA]: "https://api-linea.myx.finance/coingecko/contracts",
}

const methodology = {
  TotalVolume: "Total Volume from the sum of the open/close/liquidation of positions.",
  DailyVolume: "Daily Volume from the sum of the open/close/liquidation of positions.",
}

const getFetch = async (optios: FetchOptions) => {
  const result = await fetchURL(endpoints[optios.chain])

  const dailyVolume = result.data.reduce((acc, item) => acc + (item?.target_volume || 0), 0)

  return { dailyVolume }
}


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1706659200,
  [CHAIN.LINEA]: 1708473600,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        runAtCurrTime: true,
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
