import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";
import { httpGet } from "../utils/fetchURL";

const poolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const swapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)'

const REVENUE_RATIO = 0.1323;
// Governance vote executed ~9PM Nov 4, 2025; first full day under the new split is Nov 5.
const nov5th2025 = 1762300800; // Nov 5, 2025 00:00 UTC

// Foundation/holders split of the protocol revenue: ~24/76 before the vote, 30/70 after.
const getRatios = (timestamp: number) => {
  if (timestamp >= nov5th2025) {
    return { protocol: REVENUE_RATIO * 0.30, holders: REVENUE_RATIO * 0.70 };
  }
  return { protocol: 0.0323, holders: 0.10 };
};

const config = {
  isAlgebraV3: true,
  poolCreatedEvent,
  swapEvent,
  userFeesRatio: 1,
  revenueRatio: REVENUE_RATIO,
}

const chainData: any = {}
const factories: any = {
  [CHAIN.BASE]: '0xC5396866754799B9720125B104AE01d935Ab9C7b',
  [CHAIN.SONEIUM]: '0x8Ff309F68F6Caf77a78E9C20d2Af7Ed4bE2D7093',
  // [CHAIN.XLAYER]: '0x0284d1a8336E08AE0D3e30e7B0689Fa5B68E6310',
  [CHAIN.SOMNIA]: '0x0ccff3D02A3a200263eC4e0Fdb5E60a56721B8Ae',
}

async function fetch(options: FetchOptions) {
  const { api, startOfDay } = options
  if (!chainData[api.chain]) {
    const data = httpGet(`https://api.quickswap.exchange/v2/analytics/chart-data/${api.chainId}?durationIndex=5&version=v4`)
    chainData[api.chain] = data
    chainData[api.chain] = (await data).data[0]
  }

  const dayData = chainData[api.chain].find((day: any) => day.date === startOfDay)
  // if (!dayData) {
  //   // console.error('quickswap v4: No data for date', startOfDay, 'on chain', api.chain, 'trying to fetch via logs...')
  //   // const fetchConfig: any = { factory: factories[api.chain], ...config, }
  //   // if (api.chain === CHAIN.SOMNIA) delete fetchConfig.swapEvent

  //   // const fetchAadapter = getUniV3LogAdapter(fetchConfig)
  //   // return fetchAadapter(options)
  // }

  const fees = dayData?.feesUSD || 0;
  const volume = dayData?.dailyVolumeUSD || 0;
  const { protocol, holders } = getRatios(startOfDay);

  return {
    dailyVolume: volume,
    dailyFees: fees,
    dailyUserFees: fees,
    dailyRevenue: fees * REVENUE_RATIO,
    dailySupplySideRevenue: fees * (1 - REVENUE_RATIO),
    dailyProtocolRevenue: fees * protocol,
    dailyHoldersRevenue: fees * holders,
  }
}

const adapter: SimpleAdapter = {
  // version: 2,
  methodology: {
    Fees: 'Swap fees paid by users',
    UserFees: 'Swap fees paid by users',
    Revenue: 'Protocol takes 13.23% of collected fees.',
    ProtocolRevenue: 'Foundation receives 30% of the protocol revenue since Nov 4, 2025 (before that ~3.23% of fees).',
    SupplySideRevenue: '~86.77% of collected fees go to liquidity providers.',
    HoldersRevenue: 'Community receives 70% of the protocol revenue since Nov 4, 2025 (before that 10% of fees) for buybacks.',
  },
  fetch,
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