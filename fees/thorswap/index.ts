import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const chainMapping: any = {
  ETH: CHAIN.ETHEREUM,
  BTC: CHAIN.BITCOIN,
  AVAX: CHAIN.AVAX,
  BSC: CHAIN.BSC,
  LTC: CHAIN.LITECOIN,
  BCH: CHAIN.BITCOIN_CASH,
  DOGE: CHAIN.DOGECHAIN,
  GAIA: CHAIN.COSMOS,
  BASE: CHAIN.BASE,
  THOR: CHAIN.THORCHAIN,
  XRP: CHAIN.RIPPLE,
}

const THORCHAIN_SUPPORTED_CHAINS = ['BTC', 'ETH', 'LTC', 'DOGE', 'GAIA', 'AVAX', 'BSC', 'BCH', 'BASE', 'THOR', 'XRP']

interface Pool {
  assetLiquidityFees: string
  earnings: string
  pool: string
  rewards: string
  runeLiquidityFees: string
  saverEarning: string
  totalLiquidityFeesRune: string
}

const assetFromString = (s: string) => {

  const NATIVE_ASSET_DELIMITER = '.'
  const SYNTH_ASSET_DELIMITER = '/'
  const TRADE_ASSET_DELIMITER = '~'

  const isSynth = s.includes(SYNTH_ASSET_DELIMITER)
  const isTrade = s.includes(TRADE_ASSET_DELIMITER)
  const delimiter = isSynth ? SYNTH_ASSET_DELIMITER : isTrade ? TRADE_ASSET_DELIMITER : NATIVE_ASSET_DELIMITER

  const data = s.split(delimiter)
  if (data.length <= 1 || !data[1]) return null

  const chain = data[0].trim()
  const symbol = data[1].trim()
  const ticker = symbol.split('-')[0]

  if (!symbol || !chain) return null

  return { chain, symbol, ticker }
}

const findInterval = (timestamp: number, intervals: any) => {
  for (const interval of intervals) {
    if (interval.startTime <= timestamp && timestamp < interval.endTime) {
      return interval;
    }
  }
  return null;
};

type IRequest = {
  [key: string]: Promise<any>;
}
const requests: IRequest = {}

export async function fetchCacheURL(url: string) {
  const key = url;
  if (!requests[key])
    requests[key] = httpGet(url, { headers: {"x-client-id": "defillama"}});
  return requests[key]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))


// New function to generate fetch logic for a single chain
const getFetchForChain = (chainShortName: string) => {
  return async (_a:any, _b:any, options: FetchOptions) => {
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
    const earningsUrl = `https://midgard.ninerealms.com/v2/history/earnings?interval=day&from=${options.startTimestamp}&to=${options.endTimestamp}`;
    const reserveUrl = `https://midgard.ninerealms.com/v2/history/reserve?interval=day&from=${options.startTimestamp}&to=${options.endTimestamp}`;
    const poolsUrl = `https://midgard.ninerealms.com/v2/pools?period=24h`;

    const earnings = await fetchCacheURL(earningsUrl);
    await sleep(3000);
    const revenue = await fetchCacheURL(reserveUrl);
    await sleep(2000);
    const pools = await fetchCacheURL(poolsUrl);
    await sleep(2000);

    const selectedEarningInterval = findInterval(startOfDay, earnings.intervals);
    const selectedRevenueInterval = findInterval(startOfDay, revenue.intervals);


    const poolsByChainEarnings: Pool[] = selectedEarningInterval.pools.filter((pool: any) => assetFromString(pool.pool)?.chain === chainShortName);

    const totalRuneDepth = pools.reduce((acum: BigNumber, pool: any) => acum.plus(pool.runeDepth), BigNumber(0));
    const poolsByChainData = pools.filter((pool: any) => assetFromString(pool.asset)?.chain === chainShortName);
    const runeDepthPerChain = poolsByChainData.reduce((acum: BigNumber, pool: any) => acum.plus(pool.runeDepth), BigNumber(0));

    const protocolRevenue = BigNumber(selectedRevenueInterval.gasFeeOutbound || 0).minus(BigNumber(selectedRevenueInterval.gasReimbursement || 0));

    const runePercentagePerChain = totalRuneDepth.isZero() ? BigNumber(0) : runeDepthPerChain.div(totalRuneDepth);
    const bondingEarnings = selectedEarningInterval.bondingEarnings ? BigNumber(selectedEarningInterval.bondingEarnings) : BigNumber(0);
    const bondingRewardPerChainBasedOnRuneDepth = bondingEarnings.times(runePercentagePerChain); // TODO: Artificial distribution according to the liquidity of the pools. But it is a protocol level data
    const protocolRevenuePerChainBasedOnRuneDepth = protocolRevenue.times(runePercentagePerChain);

    const dailyFees = poolsByChainEarnings.reduce((acum, pool) => {
      const liquidityFeesPerPoolInDollars = BigNumber(pool.totalLiquidityFeesRune).div(1e8).times(BigNumber(selectedEarningInterval.runePriceUSD));
      const saverLiquidityFeesPerPoolInDollars = BigNumber(pool.saverEarning).div(1e8).times(BigNumber(selectedEarningInterval.runePriceUSD));
      const totalLiquidityFees = liquidityFeesPerPoolInDollars.plus(saverLiquidityFeesPerPoolInDollars);
      return acum.plus(totalLiquidityFees);
    }, BigNumber(0));

    const dailySupplysideRevenue = poolsByChainEarnings.reduce((acum, pool) => {
      const liquidityFeesPerPoolInDollars = BigNumber(pool.totalLiquidityFeesRune).div(1e8).times(BigNumber(selectedEarningInterval.runePriceUSD));
      const saverLiquidityFeesPerPoolInDollars = BigNumber(pool.saverEarning).div(1e8).times(BigNumber(selectedEarningInterval.runePriceUSD));
      const rewardsInDollars = BigNumber(pool.rewards).div(1e8).times(BigNumber(selectedEarningInterval.runePriceUSD));
      const totalLiquidityFees = liquidityFeesPerPoolInDollars.plus(saverLiquidityFeesPerPoolInDollars).plus(rewardsInDollars);
      return acum.plus(totalLiquidityFees);
    }, BigNumber(0));

    const runePriceUSDNum = selectedEarningInterval.runePriceUSD ? Number(selectedEarningInterval.runePriceUSD) : 0;
    const protocolRevenueByChainInDollars = protocolRevenuePerChainBasedOnRuneDepth.div(1e8).times(runePriceUSDNum);
    const dailyHoldersRevenue = bondingRewardPerChainBasedOnRuneDepth.div(1e8).times(runePriceUSDNum);
    // if (dailyFees.isZero()) throw new Error("No fees found for this day");

      return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: `${dailyHoldersRevenue.plus(protocolRevenueByChainInDollars)}`,
        dailyProtocolRevenue: protocolRevenueByChainInDollars.gt(0) ? protocolRevenueByChainInDollars : 0,
        dailyHoldersRevenue: dailyHoldersRevenue,
        dailySupplySideRevenue: dailySupplysideRevenue,
        timestamp: startOfDay
      };
  };
};

const adapters: SimpleAdapter = {
  adapter: THORCHAIN_SUPPORTED_CHAINS.reduce((acc, chainKey) => {
    (acc as any)[chainMapping[chainKey]] = {
      fetch: getFetchForChain(chainKey) as any,
      // runAtCurrTime: true,
    };
    return acc;
  }, {}),
};

export default adapters
