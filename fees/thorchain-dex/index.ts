import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";


const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2022-09-07', symbol: 'ETH' },
  [CHAIN.BITCOIN]: { start: '2022-09-07', symbol: 'BTC' },
  [CHAIN.LITECOIN]: { start: '2022-09-07', symbol: 'LTC' },
  [CHAIN.DOGECHAIN]: { start: '2022-09-07', symbol: 'DOGE' },
  [CHAIN.COSMOS]: { start: '2022-09-07', symbol: 'GAIA' },
  [CHAIN.AVAX]: { start: '2022-09-07', symbol: 'AVAX' },
  [CHAIN.BSC]: { start: '2022-09-07', symbol: 'BSC' },
  [CHAIN.BITCOIN_CASH]: { start: '2022-09-07', symbol: 'BCH' },
  [CHAIN.BASE]: { start: '2022-09-07', symbol: 'BASE' },
  [CHAIN.THORCHAIN]: { start: '2022-09-07', symbol: 'THOR' },
  [CHAIN.RIPPLE]: { start: '2022-09-07', symbol: 'XRP' },
  [CHAIN.SOLANA]: { start: '2022-09-07', symbol: 'SOL' },
  [CHAIN.TRON]: { start: '2022-09-07', symbol: 'TRON' },
}

interface Pool {
  assetLiquidityFees: string
  earnings: string
  pool: string
  rewards: string
  runeLiquidityFees: string
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
    requests[key] = httpGet(url, { headers: { "x-client-id": "defillama" } });
  return requests[key]
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))


// New function to generate fetch logic for a single chain
const fetch: any = async (options: FetchOptions) => {
  const startOfDay = options.startOfDay;
  const chainShortName = chainConfig[options.chain].symbol;
  const earningsUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/earnings?interval=day&from=${options.startTimestamp}&to=${options.endTimestamp}`;
  // Official Midgard reserve history via the Liquify gateway (full daily history; same fields as before).
  const reserveUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/reserve?interval=day&from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const poolsUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/pools?period=24h`;

  const earnings = await fetchCacheURL(earningsUrl);
  await sleep(3000);
  const revenue = await fetchCacheURL(reserveUrl);
  await sleep(2000);
  const pools = await fetchCacheURL(poolsUrl);
  await sleep(2000);

  // Only fetch affiliate earnings for THOR chain
  let affiliateEarnings: any | null = null;
  if (chainShortName === 'THOR') {
    const affiliateUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/affiliate?from=${options.startTimestamp}&to=${options.endTimestamp}`;
    affiliateEarnings = await fetchCacheURL(affiliateUrl);
    await sleep(2000);
  }

  const selectedEarningInterval = findInterval(startOfDay, earnings.intervals);
  const selectedRevenueInterval = findInterval(startOfDay, revenue.intervals);


  const poolsByChainEarnings: Pool[] = selectedEarningInterval.pools.filter((pool: any) => assetFromString(pool.pool)?.chain === chainShortName);

  const totalRuneDepth = pools.reduce((acum: BigNumber, pool: any) => acum.plus(pool.runeDepth), BigNumber(0));
  const poolsByChainData = pools.filter((pool: any) => assetFromString(pool.asset)?.chain === chainShortName);
  const runeDepthPerChain = poolsByChainData.reduce((acum: BigNumber, pool: any) => acum.plus(pool.runeDepth), BigNumber(0));

  const runePriceUSD = BigNumber(selectedEarningInterval.runePriceUSD || 0);

  // Net outbound (network) fee kept by the protocol, in RUNE: outbound gas charged minus gas reimbursed.
  // Protocol-level value, attributed per chain by the chain's share of total RUNE pool depth.
  const netOutboundRune = BigNumber(selectedRevenueInterval?.gasFeeOutbound || 0).minus(BigNumber(selectedRevenueInterval?.gasReimbursement || 0));
  const runeDepthShare = totalRuneDepth.isZero() ? BigNumber(0) : runeDepthPerChain.div(totalRuneDepth);
  const rawOutboundFeeUSD = netOutboundRune.times(runeDepthShare).div(1e8).times(runePriceUSD);
  const chainOutboundFeeUSD = rawOutboundFeeUSD.gt(0) ? rawOutboundFeeUSD : BigNumber(0);

  // Network-wide Incentive Pendulum split of system income between nodes (RUNE bonders) and pools (LPs).
  // We apply this ratio to the chain's actual swap fees, so RUNE block-reward emissions are excluded from fees/revenue.
  const systemIncome = BigNumber(selectedEarningInterval.earnings || 0);
  const bondingEarnings = BigNumber(selectedEarningInterval.bondingEarnings || 0);
  const nodeShareRatio = systemIncome.isZero() ? BigNumber(0) : bondingEarnings.div(systemIncome);

  // Slip-based liquidity (swap) fees paid by users on this chain's pools, in USD. Savers yield is NOT a
  // separate user fee: it is paid out of these same liquidity fees, so counting it on top would double-count.
  const chainSwapFeesUSD = poolsByChainEarnings.reduce((acum, pool) => {
    const liquidityFees = BigNumber(pool.totalLiquidityFeesRune).div(1e8).times(runePriceUSD);
    return acum.plus(liquidityFees);
  }, BigNumber(0));

  // Affiliate fees charged by interfaces/wallets (pass-through to integrators, so they are also supply-side).
  // Only exposed at the network level, attributed to the THORChain native chain.
  const affiliateFeesUSD = (chainShortName === 'THOR' && affiliateEarnings?.intervals?.length > 0)
    ? BigNumber(affiliateEarnings.intervals[0].volumeUSD).div(1e2)
    : BigNumber(0);

  // THORChain governance carve-outs from system income (= swap fees here; RUNE block-reward emissions are
  // ~0 and excluded). Percentages are fixed protocol constants; activation dates:
  //   5% RUNE burn:       from 2024-09-16.
  //   5% developer fund:  from 2024-09-16.
  //   10% to TCY stakers: from 2025-05-01.
  //   5% marketing fund:  from 2025-11-04.
  const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const burnPct = dateStr >= '2024-09-16' ? 0.05 : 0;
  const devPct = dateStr >= '2024-09-16' ? 0.05 : 0;
  const tcyPct = dateStr >= '2025-05-01' ? 0.10 : 0;
  const marketingPct = dateStr >= '2025-11-04' ? 0.05 : 0;

  const burnUSD = chainSwapFeesUSD.times(burnPct);
  const tcyUSD = chainSwapFeesUSD.times(tcyPct);
  const devUSD = chainSwapFeesUSD.times(devPct);
  const marketingUSD = chainSwapFeesUSD.times(marketingPct);

  // The rest of system income is split between nodes (RUNE bonders) and pools (LPs) by the Incentive
  // Pendulum ratio. node + LP + every carve-out sum to the swap fees exactly, so the income-statement
  // identity (Fees = Revenue + SupplySideRevenue) holds.
  const nodePoolUSD = chainSwapFeesUSD.minus(burnUSD).minus(tcyUSD).minus(devUSD).minus(marketingUSD);
  const nodeRevenueUSD = nodePoolUSD.times(nodeShareRatio);
  const lpRevenueUSD = nodePoolUSD.minus(nodeRevenueUSD);

  // Emit each component under its own label so the breakdown is itemized in the UI.
  // Only the RUNE burn accrues to every RUNE holder -> holders. The node-bonder (security) share, the LP
  // share, affiliate (integrator) fees and TCY rewards all pay suppliers -> supply. Outbound fee and the
  // developer/marketing funds are kept by the protocol -> protocol.
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(chainSwapFeesUSD.toNumber(), 'Swap Fees');
  dailyFees.addUSDValue(chainOutboundFeeUSD.toNumber(), 'Outbound Fees');
  dailyFees.addUSDValue(affiliateFeesUSD.toNumber(), 'Affiliate Fees');

  const dailyUserFees = options.createBalances();
  dailyUserFees.addUSDValue(chainSwapFeesUSD.toNumber(), 'Swap Fees');
  dailyUserFees.addUSDValue(chainOutboundFeeUSD.toNumber(), 'Outbound Fees');
  dailyUserFees.addUSDValue(affiliateFeesUSD.toNumber(), 'Affiliate Fees');

  // RUNE-holder value is only the RUNE burn - the single component that accrues to every RUNE holder.
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addUSDValue(burnUSD.toNumber(), 'RUNE Burn');

  // Supply-side value: the node-operator (RUNE bonder) share is a security cost, the LP share pays
  // liquidity providers, affiliate fees pass through to integrators, and TCY rewards pay TCY stakers.
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(nodeRevenueUSD.toNumber(), 'Swap Fees To RUNE Bonders');
  dailySupplySideRevenue.addUSDValue(lpRevenueUSD.toNumber(), 'Swap Fees To LPs');
  dailySupplySideRevenue.addUSDValue(affiliateFeesUSD.toNumber(), 'Affiliate Fees To Integrators');
  dailySupplySideRevenue.addUSDValue(tcyUSD.toNumber(), 'TCY Staker Rewards');

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(chainOutboundFeeUSD.toNumber(), 'Outbound Fees To Protocol');
  dailyProtocolRevenue.addUSDValue(devUSD.toNumber(), 'Developer Fund');
  dailyProtocolRevenue.addUSDValue(marketingUSD.toNumber(), 'Marketing Fund');

  // Revenue = value kept by the protocol + the RUNE burn. The node-bonder share is a security cost and the
  // LP/affiliate/TCY shares pay suppliers, so none of those count as revenue.
  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(burnUSD.toNumber(), 'RUNE Burn');
  dailyRevenue.addUSDValue(chainOutboundFeeUSD.toNumber(), 'Outbound Fees To Protocol');
  dailyRevenue.addUSDValue(devUSD.toNumber(), 'Developer Fund');
  dailyRevenue.addUSDValue(marketingUSD.toNumber(), 'Marketing Fund');

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools, the protocol's net outbound (network) fee, and affiliate fees charged by interfaces/wallets (affiliate fees are attributed to the THORChain native chain). RUNE block-reward emissions are excluded.",
  UserFees: "All swap, outbound and affiliate fees paid by users when swapping through THORChain.",
  Revenue: "The 5% RUNE burn (value to all RUNE holders) plus protocol-kept income (net outbound network fee, developer fund and marketing fund). The node-bonder share of swap fees is treated as a security cost and the LP, affiliate and TCY shares as supplier payments, so none of those count as revenue.",
  ProtocolRevenue: "Income kept by the protocol: net outbound network fee plus the 5% developer fund and 5% marketing fund taken from system income.",
  HoldersRevenue: "Value to RUNE holders: the 5% of system income burned (RUNE permanently removed from supply), the only component that accrues to every RUNE holder.",
  SupplySideRevenue: "Value paid to suppliers: the node-operator (RUNE bonder) share of swap fees set by the Incentive Pendulum (a security cost), the liquidity-provider share of swap fees (LP side of the Incentive Pendulum), affiliate fees passed through to integrators, and the 10% of system income paid to TCY stakers.",
};

const breakdownMethodology = {
  Fees: {
    'Swap Fees': "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools.",
    'Outbound Fees': "Net outbound network fee (outbound gas charged minus gas reimbursed) paid by users.",
    'Affiliate Fees': "Fees charged by the interface or wallet that built the swap (attributed to the THORChain native chain).",
  },
  UserFees: {
    'Swap Fees': "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools.",
    'Outbound Fees': "Net outbound network fee (outbound gas charged minus gas reimbursed) paid by users.",
    'Affiliate Fees': "Fees charged by the interface or wallet that built the swap (attributed to the THORChain native chain).",
  },
  Revenue: {
    'RUNE Burn': "5% of system income burned, permanently removing RUNE from supply (since 2024-09-16).",
    'Outbound Fees To Protocol': "Net outbound network fee kept by the protocol.",
    'Developer Fund': "5% of system income allocated to the developer fund (since 2024-09-16).",
    'Marketing Fund': "5% of system income allocated to the marketing fund (since 2025-11-04).",
  },
  ProtocolRevenue: {
    'Outbound Fees To Protocol': "Net outbound network fee kept by the protocol, attributed per chain by RUNE pool-depth share.",
    'Developer Fund': "5% of system income allocated to the developer fund (since 2024-09-16).",
    'Marketing Fund': "5% of system income allocated to the marketing fund (since 2025-11-04).",
  },
  HoldersRevenue: {
    'RUNE Burn': "5% of system income burned, permanently removing RUNE from supply and accruing value to RUNE holders (since 2024-09-16).",
  },
  SupplySideRevenue: {
    'Swap Fees To RUNE Bonders': "Node operators' (RUNE bonders') share of swap fees, set network-wide by the Incentive Pendulum - a security cost paid to the nodes that bond RUNE to secure the network.",
    'Swap Fees To LPs': "Liquidity providers' share of swap fees (the LP side of the Incentive Pendulum).",
    'Affiliate Fees To Integrators': "Affiliate fees passed through to the integrator that built the swap.",
    'TCY Staker Rewards': "10% of system income paid in RUNE to TCY stakers (since 2025-05-01).",
  },
};

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapters