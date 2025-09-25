import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const permuteEndpoint = "https://api.permute.finance/bridge"

const chainConfig = {
  [CHAIN.BITCOIN]: { start: '2025-05-28', key: 'BTC'},
  [CHAIN.ETHEREUM]: { start: '2025-05-28', key: 'ETH'},
  [CHAIN.AVAX]: { start: '2025-05-28', key: 'AVXC'},
  [CHAIN.ARBITRUM]: { start: '2025-05-28', key: 'ARBITRUM'},
  [CHAIN.BSC]: { start: '2025-05-28', key: 'BSC'},
  [CHAIN.TRON]: { start: '2025-05-28', key: 'TRON'},
  [CHAIN.LITECOIN]: { start: '2025-05-28', key: 'LTC'},
  [CHAIN.BITCOIN_CASH]: { start: '2025-05-28', key: 'BCH'},
  [CHAIN.DOGE]: { start: '2025-05-28', key: 'DOGE'},
  [CHAIN.SOLANA]: { start: '2025-05-28', key: 'SOL'},
  [CHAIN.BERACHAIN]: { start: '2025-05-28', key: 'BERA'},
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  const url = permuteEndpoint.concat(`/dashboard/vol/chain/day?chain=${chainConfig[options.chain].key}&timestamp=${startOfDay}`)
  const volumeForDay = await fetchURL(url)

  const dailyVolume = volumeForDay.day_vol
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig,
};

export default adapter;