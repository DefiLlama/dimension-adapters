import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";

// Start dates are each chain's first trading day on THORChain, taken from the first non-zero day in
// raynalytics swap-volume-fees-by-chain (ETH/BTC/LTC = genesis; the rest are when their pools went live).
const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2021-04-11', symbol: 'ETH' },
  [CHAIN.BITCOIN]: { start: '2021-04-11', symbol: 'BTC' },
  [CHAIN.LITECOIN]: { start: '2021-04-11', symbol: 'LTC' },
  [CHAIN.DOGE]: { start: '2022-01-16', symbol: 'DOGE' },
  // dead: Terra Classic collapsed, no THORChain swaps after 2022-05-10. Kept for historical data; returns 0 since.
  [CHAIN.TERRA]: { start: '2022-03-24', deadFrom: '2022-05-10', symbol: 'TERRA' },
  // Binance Beacon Chain (feed "BNB", dead 2024-03-25) omitted: no DefiLlama chain key for it (CHAIN.BSC is Binance Smart Chain).
  [CHAIN.COSMOS]: { start: '2022-07-05', symbol: 'GAIA' },
  [CHAIN.AVAX]: { start: '2022-09-23', symbol: 'AVAX' },
  [CHAIN.BSC]: { start: '2023-09-10', symbol: 'BSC' },
  [CHAIN.BITCOIN_CASH]: { start: '2021-04-11', symbol: 'BCH' },
  [CHAIN.BASE]: { start: '2025-01-08', symbol: 'BASE' },
  [CHAIN.THORCHAIN]: { start: '2021-04-11', symbol: 'THOR' },
  [CHAIN.RIPPLE]: { start: '2025-06-04', symbol: 'XRP' },
  [CHAIN.SOLANA]: { start: '2026-02-24', symbol: 'SOL' },
  [CHAIN.TRON]: { start: '2025-10-01', symbol: 'TRON' },
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
  const earningsUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/earnings?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  // Official Midgard reserve history via the Liquify gateway (full daily history; same fields as before).
  const reserveUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/reserve?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  // Per-chain daily swap volume, full history. Used only to split the network-level outbound fee across
  // chains by activity share. Different host (no date param), fetched once and reused for every chain.
  const volumeByChainUrl = `https://raynalytics.net/api/swap-volume-fees-by-chain`;

  const earnings = await fetchCacheURL(earningsUrl);
  await sleep(3000);
  const revenue = await fetchCacheURL(reserveUrl);
  await sleep(2000);
  const volumeByChain = await fetchCacheURL(volumeByChainUrl);

  // Affiliate (interface/wallet) fees only apply to the THOR native chain. Sourced from raynalytics
  // daily-affiliate-fees: full daily history back to 2021 whose UTC day labels align with our startOfDay.
  // The Midgard affiliate endpoint returns 0 before ~2025 (it would drop ~$22M of 2021-2024 affiliate fees);
  // for 2025+ the two sources match ~1:1.
  let affiliateByDay: any[] | null = null;
  if (chainShortName === 'THOR') {
    affiliateByDay = await fetchCacheURL(`https://raynalytics.net/api/daily-affiliate-fees`);
  }

  const selectedEarningInterval = findInterval(startOfDay, earnings.intervals);
  const selectedRevenueInterval = findInterval(startOfDay, revenue.intervals);

  const poolsByChainEarnings: Pool[] = selectedEarningInterval.pools.filter((pool: any) => assetFromString(pool.pool)?.chain === chainShortName);

  const runePriceUSD = Number(selectedEarningInterval.runePriceUSD || 0);
  // RUNE amounts are in 1e8 base units; values here are USD fees in the thousands, well within JS precision.
  const toUSD = (runeBaseUnits: any) => (Number(runeBaseUnits) || 0) / 1e8 * runePriceUSD;
  const sumVolume = (rows: any[]) => rows.reduce((acc: number, r: any) => acc + (r.USD_VOLUME || 0), 0);

  // Net outbound (network) fee kept by the protocol: outbound gas charged minus gas reimbursed. It is a single
  // network-wide reserve figure, so we split it across chains by each chain's share of that day's swap volume.
  // The denominator is restricted to the chains we track, so the shares re-normalise to 1 and the network-wide
  // outbound total is preserved.
  const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const netOutboundRune = Number(selectedRevenueInterval?.gasFeeOutbound || 0) - Number(selectedRevenueInterval?.gasReimbursement || 0);

  const trackedSymbols = new Set(Object.values(chainConfig).map((c: any) => c.symbol));
  const dayVolumeRows = volumeByChain.filter((r: any) => r.DATE.slice(0, 10) === dateStr && trackedSymbols.has(r.CHAIN));
  const totalVolume = sumVolume(dayVolumeRows);
  // The outbound fee can only be attributed via swap-volume share. If there is a positive outbound fee but no
  // volume data for the day, fail loudly instead of silently dropping it (a swap-volume feed gap / mismatch).
  if (netOutboundRune > 0 && totalVolume === 0)
    throw new Error(`thorchain-dex: outbound fee present (${netOutboundRune} RUNE base units) on ${dateStr} but no swap-volume data to attribute it across chains`);
  const volumeShare = totalVolume ? sumVolume(dayVolumeRows.filter((r: any) => r.CHAIN === chainShortName)) / totalVolume : 0;

  const outboundFee = Math.max(0, toUSD(netOutboundRune) * volumeShare);

  // Network-wide Incentive Pendulum split of system income between nodes (RUNE bonders) and LPs. We apply this
  // ratio to the chain's actual swap fees, so RUNE block-reward emissions are excluded from fees/revenue.
  const systemIncome = Number(selectedEarningInterval.earnings || 0);
  const nodeShareRatio = systemIncome ? Number(selectedEarningInterval.bondingEarnings || 0) / systemIncome : 0;

  // Slip-based liquidity (swap) fees paid by users on this chain's pools, in USD.
  const swapFees = poolsByChainEarnings.reduce((acc, pool) => acc + toUSD(pool.totalLiquidityFeesRune), 0);

  // Affiliate fees charged by interfaces/wallets (pass-through to integrators, so they are also supply-side).
  // Network-level, attributed to the THORChain native chain. Summed across all affiliates for the day (USD).
  const affiliateFees = (chainShortName === 'THOR' && affiliateByDay)
    ? affiliateByDay
        .filter((r: any) => r.DAY.slice(0, 10) === dateStr)
        .reduce((acc: number, r: any) => acc + Number(r.AFFILIATE_FEE_USD || 0), 0)
    : 0;

  // THORChain governance carve-outs from swap fees (RUNE block-reward emissions are ~0 and excluded). Fixed
  // protocol constants; activation dates: 5% burn + 5% dev from 2024-09-16, 10% TCY from 2025-05-01, 5%
  // marketing from 2025-11-04.
  const burnPct = dateStr >= '2024-09-16' ? 0.05 : 0;
  const devPct = dateStr >= '2024-09-16' ? 0.05 : 0;
  const tcyPct = dateStr >= '2025-05-01' ? 0.10 : 0;
  const marketingPct = dateStr >= '2025-11-04' ? 0.05 : 0;

  const burn = swapFees * burnPct;
  const dev = swapFees * devPct;
  const tcy = swapFees * tcyPct;
  const marketing = swapFees * marketingPct;

  // The rest is split between nodes (RUNE bonders) and LPs by the Incentive Pendulum ratio. node + LP + every
  // carve-out sum to swap fees exactly, so the identity Fees = Revenue + SupplySideRevenue holds.
  const nodePool = swapFees * (1 - burnPct - devPct - tcyPct - marketingPct);
  const nodeRevenue = nodePool * nodeShareRatio;
  const lpRevenue = nodePool - nodeRevenue;

  // Emit each component under its own label so the breakdown is itemized in the UI.
  // Only the RUNE burn accrues to every RUNE holder -> holders. The node-bonder (security) share, the LP
  // share, affiliate (integrator) fees and TCY rewards all pay suppliers -> supply. Outbound fee and the
  // developer/marketing funds are kept by the protocol -> protocol.
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(swapFees, 'Swap Fees');
  dailyFees.addUSDValue(outboundFee, 'Outbound Fees');
  dailyFees.addUSDValue(affiliateFees, 'Affiliate Fees');

  // RUNE-holder value is only the RUNE burn - the single component that accrues to every RUNE holder.
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addUSDValue(burn, 'RUNE Burn');

  // Supply-side value: the node-operator (RUNE bonder) share is a security cost, the LP share pays
  // liquidity providers, affiliate fees pass through to integrators, and TCY rewards pay TCY stakers.
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(nodeRevenue, 'Swap Fees To RUNE Bonders');
  dailySupplySideRevenue.addUSDValue(lpRevenue, 'Swap Fees To LPs');
  dailySupplySideRevenue.addUSDValue(affiliateFees, 'Affiliate Fees To Integrators');
  dailySupplySideRevenue.addUSDValue(tcy, 'TCY Staker Rewards');

  // Revenue = protocol-kept income (outbound + dev + marketing) + the RUNE burn. The node-bonder share is a
  // security cost and the LP/affiliate/TCY shares pay suppliers, so none of those count as revenue.
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(outboundFee, 'Outbound Fees To Protocol');
  dailyProtocolRevenue.addUSDValue(dev, 'Developer Fund');
  dailyProtocolRevenue.addUSDValue(marketing, 'Marketing Fund');

  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(burn, 'RUNE Burn');
  dailyRevenue.addUSDValue(outboundFee, 'Outbound Fees To Protocol');
  dailyRevenue.addUSDValue(dev, 'Developer Fund');
  dailyRevenue.addUSDValue(marketing, 'Marketing Fund');

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools, the protocol's net outbound (network) fee, and affiliate fees charged by interfaces/wallets (affiliate fees are attributed to the THORChain native chain). RUNE block-reward emissions are excluded.",
  UserFees: "All swap, outbound and affiliate fees paid by users when swapping through THORChain.",
  Revenue: "The 5% of swap fees burned as RUNE (value to all RUNE holders) plus protocol-kept income (net outbound network fee, developer fund and marketing fund). The node-bonder share of swap fees is treated as a security cost and the LP, affiliate and TCY shares as supplier payments, so none of those count as revenue.",
  ProtocolRevenue: "Income kept by the protocol: the net outbound network fee plus the 5% developer fund and 5% marketing fund taken from swap fees.",
  HoldersRevenue: "Value to RUNE holders: the 5% of swap fees burned as RUNE (permanently removed from supply), the only component that accrues to every RUNE holder.",
  SupplySideRevenue: "Value paid to suppliers: the node-operator (RUNE bonder) share of swap fees set by the Incentive Pendulum (a security cost), the liquidity-provider share of swap fees (LP side of the Incentive Pendulum), affiliate fees passed through to integrators, and the 10% of swap fees paid to TCY stakers.",
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
    'RUNE Burn': "5% of swap fees burned, permanently removing RUNE from supply (since 2024-09-16).",
    'Outbound Fees To Protocol': "Net outbound network fee kept by the protocol.",
    'Developer Fund': "5% of swap fees allocated to the developer fund (since 2024-09-16).",
    'Marketing Fund': "5% of swap fees allocated to the marketing fund (since 2025-11-04).",
  },
  ProtocolRevenue: {
    'Outbound Fees To Protocol': "Net outbound network fee kept by the protocol, a network-level figure split across chains by each chain's share of daily swap volume.",
    'Developer Fund': "5% of swap fees allocated to the developer fund (since 2024-09-16).",
    'Marketing Fund': "5% of swap fees allocated to the marketing fund (since 2025-11-04).",
  },
  HoldersRevenue: {
    'RUNE Burn': "5% of swap fees burned, permanently removing RUNE from supply and accruing value to RUNE holders (since 2024-09-16).",
  },
  SupplySideRevenue: {
    'Swap Fees To RUNE Bonders': "Node operators' (RUNE bonders') share of swap fees, set network-wide by the Incentive Pendulum - a security cost paid to the nodes that bond RUNE to secure the network.",
    'Swap Fees To LPs': "Liquidity providers' share of swap fees (the LP side of the Incentive Pendulum).",
    'Affiliate Fees To Integrators': "Affiliate fees passed through to the integrator that built the swap.",
    'TCY Staker Rewards': "10% of swap fees paid in RUNE to TCY stakers (since 2025-05-01).",
  },
};

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapters;
