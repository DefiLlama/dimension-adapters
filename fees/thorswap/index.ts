import BigNumber from "bignumber.js";
import { SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";

const chainMapping = {
  ETH: CHAIN.ETHEREUM,
  BTC: CHAIN.BITCOIN,
  AVAX: CHAIN.AVAX,
  BSC: CHAIN.BSC,
  LTC: CHAIN.LITECOIN,
  BCH: CHAIN.BITCOIN_CASH,
  DOGE: CHAIN.DOGECHAIN,
  GAIA: CHAIN.COSMOS,
}

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

const findInterval = (timestamp: number, intervals) => {
  for (const interval of intervals) {
    if (interval.startTime <= timestamp && timestamp < interval.endTime) {
      return interval;
    }
  }
  return null;
};

let earnings: any;
let revenue: any;
let pools: any;

const fetchFeesByChain = () => {
  const adapter = {}
  const chains = ['BTC', 'ETH', 'LTC', 'DOGE', 'GAIA', 'AVAX', 'BSC', 'BCH']
  chains.forEach((chain: string) => {
    adapter[chainMapping[chain]] = {
      runAtCurrTime: true,
      fetch:  async (timestamp: number) => {

        const earningsUrl = `https://midgard.ninerealms.com/v2/history/earnings?interval=day&count=2`
        const reserveUrl = `https://midgard.ninerealms.com/v2/history/reserve?interval=day&count=2`
        const poolsUrl = `https://midgard.ninerealms.com/v2/pools?period=24h`
        if (!earnings) {
          earnings = await httpGet(earningsUrl, { headers: {"x-client-id": "defillama"}});
        }
        if (!revenue) {
          revenue = await httpGet(reserveUrl, { headers: {"x-client-id": "defillama"}});
        }
        if (!pools) {
          pools = await httpGet(poolsUrl, { headers: {"x-client-id": "defillama"}});
        }
        const selectedEarningInterval = findInterval(timestamp, earnings.intervals);
        const selectedRevenueInterval = findInterval(timestamp, revenue.intervals);

        const poolsByChainEarnings: Pool[] = selectedEarningInterval?.pools?.filter(pool => assetFromString(pool.pool)?.chain === chain)

        const totalRuneDepth = pools.reduce((acum, pool) => acum.plus(pool.runeDepth), BigNumber(0))
        const poolsByChainData = pools?.filter(pool => assetFromString(pool.asset)?.chain === chain)
        const runeDepthPerChain = poolsByChainData.reduce((acum, pool) => acum.plus(pool.runeDepth), BigNumber(0))

        const protocolRevenue = BigNumber(selectedRevenueInterval.gasFeeOutbound).minus(selectedRevenueInterval.gasReimbursement)

        const runePercentagePerChain = runeDepthPerChain.div(totalRuneDepth)
        const bondingRewardPerChainBasedOnRuneDepth = BigNumber(selectedEarningInterval.bondingEarnings).times(runePercentagePerChain) // TODO: Artificial distribution according to the liquidity of the pools. But it is a protocol level data
        const protocolRevenuePerChainBasedOnRuneDepth = protocolRevenue.times(runePercentagePerChain)

        const dailyFees = poolsByChainEarnings.reduce((acum, pool) => {
          const liquidityFeesPerPoolInDollars = BigNumber(pool.totalLiquidityFeesRune).div(1e8).times(selectedEarningInterval.runePriceUSD)
          const saverLiquidityFeesPerPoolInDollars = BigNumber(pool.saverEarning).div(1e8).times(selectedEarningInterval.runePriceUSD)
          const totalLiquidityFees = liquidityFeesPerPoolInDollars.plus(saverLiquidityFeesPerPoolInDollars)
          return acum.plus(totalLiquidityFees)
        }, BigNumber(0))

        const dailySupplysideRevenue = poolsByChainEarnings.reduce((acum, pool) => {
          const liquidityFeesPerPoolInDollars = BigNumber(pool.totalLiquidityFeesRune).div(1e8).times(selectedEarningInterval.runePriceUSD)
          const saverLiquidityFeesPerPoolInDollars = BigNumber(pool.saverEarning).div(1e8).times(selectedEarningInterval.runePriceUSD)
          const rewardsInDollars = BigNumber(pool.rewards).div(1e8).times(selectedEarningInterval.runePriceUSD)
          const totalLiquidityFees = liquidityFeesPerPoolInDollars.plus(saverLiquidityFeesPerPoolInDollars).plus(rewardsInDollars)
          return acum.plus(totalLiquidityFees)
        }, BigNumber(0))

        const protocolRevenueByChainInDollars = protocolRevenuePerChainBasedOnRuneDepth.div(1e8).times(Number(selectedEarningInterval.runePriceUSD));
        const dailyHoldersRevenue = BigNumber(bondingRewardPerChainBasedOnRuneDepth).div(1e8).times(selectedEarningInterval.runePriceUSD);
        return {
          dailyFees: dailyFees ? `${dailyFees}` : undefined, // Liquidity fees not include chain fees
          dailyUserFees: dailyFees ? `${dailyFees}` : undefined, // Liquidity fees not include chain fees
          dailyRevenue: `${dailyHoldersRevenue.plus(protocolRevenueByChainInDollars)}`, // dailyProtocolRevenue + dailyHoldersRevenue
          dailyProtocolRevenue:  protocolRevenueByChainInDollars ? `${protocolRevenueByChainInDollars}` : undefined, // Output fees - reimbursments
          dailyHoldersRevenue: dailyHoldersRevenue ? `${dailyHoldersRevenue}` : undefined, // Rewards for nodes pondered by chain liquidity
          dailySupplySideRevenue: dailySupplysideRevenue ? `${dailySupplysideRevenue}` : undefined, // Earnings: rewards + liquidity fees per pool
          timestamp
        }
      }
    }
  });

  return adapter
}
const adapters: SimpleAdapter = {
  version: 1,
  adapter: fetchFeesByChain(),
  isExpensiveAdapter: true
}

export default adapters
