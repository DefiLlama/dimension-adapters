import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";
import { httpGet } from "../utils/fetchURL";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'

const config = {
  isAlgebraV3: true,
  poolCreatedEvent,
  swapEvent,
  userFeesRatio: 1,
  revenueRatio: 0, // 100% fees to LPs
  protocolRevenueRatio: 0, // 100% fees to LPs
}

const chainData: any = {}
const factories: any = {
  [CHAIN.BASE]: '0xC5396866754799B9720125B104AE01d935Ab9C7b',
  [CHAIN.SONEIUM]: '0x8Ff309F68F6Caf77a78E9C20d2Af7Ed4bE2D7093',
  // [CHAIN.XLAYER]: '0x0284d1a8336E08AE0D3e30e7B0689Fa5B68E6310',
  [CHAIN.SOMNIA]: '0x0ccff3D02A3a200263eC4e0Fdb5E60a56721B8Ae',
}

async function currentFetch(_:any, _1: any, options: FetchOptions) {
  const { api, fromTimestamp } = options
  const dayId = Math.floor(fromTimestamp / 86400).toString()
  if (!chainData[api.chain]) {
    const data = httpGet('https://api.quickswap.exchange/analytics/chart-data/5/v4?chainId='+api.chainId)
    chainData[api.chain] = data
    chainData[api.chain] = (await data).data[0]
  }

  const dayData = chainData[api.chain].find((day: any) => day.id === dayId)
  if (!dayData)  {
    console.error('quickswap v4: No data for dayId', dayId, 'on chain', api.chain, 'trying to fetch via logs...')
    const fetchConfig: any = { factory: factories[api.chain], ...config,  }
    if (api.chain === CHAIN.SOMNIA) delete fetchConfig.swapEvent
    
    const fetchAadapter = getUniV3LogAdapter(fetchConfig)
    return fetchAadapter(options)
    // throw new Error('No data for dayId: ' + dayId + ' on chain: ' + api.chain)
  }

  return {
    dailyVolume: dayData.volumeUSD,
    dailyFees: dayData.feesUSD,
    dailyUserFees: dayData.feesUSD,
    dailyRevenue: 0,
    dailySupplySideRevenue: dayData.feesUSD,
    dailyProtocolRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  // version: 2,
  methodology: {
    Fees: 'Swap fees paid by users',
    UserFees: 'Swap fees paid by users',
    Revenue: 'No revenue',
    ProtocolRevenue: 'No protocol revenue',
    SupplySideRevenue: '100% swap fees to LPs',
  },
  fetch: currentFetch,
  adapter: {
    [CHAIN.BASE]: {
      // fetch: getUniV3LogAdapter({ factory: '0xC5396866754799B9720125B104AE01d935Ab9C7b', ...config }),
      start: '2025-08-12',
    },
    [CHAIN.SONEIUM]: {
      // fetch: getUniV3LogAdapter({ factory: '0x8Ff309F68F6Caf77a78E9C20d2Af7Ed4bE2D7093', ...config }),
      start: '2025-08-12',
    },
    // [CHAIN.XLAYER]: {
    //   fetch: getUniV3LogAdapter({ factory: '0x0284d1a8336E08AE0D3e30e7B0689Fa5B68E6310', ...config }),
    //   start: '2025-08-12',
    // },
    [CHAIN.SOMNIA]: {
      // fetch: getUniV3LogAdapter({ factory: '0x0ccff3D02A3a200263eC4e0Fdb5E60a56721B8Ae', ...config, swapEvent: undefined, }),
      start: '2025-08-29',
    }
  }
}

export default adapter