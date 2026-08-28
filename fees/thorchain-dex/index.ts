import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL";

// Start dates are each chain's first trading day on THORChain, taken from the first non-zero day in
// raynalytics swap-volume-fees-by-chain (ETH/BTC/LTC = genesis; the rest are when their pools went live).
const chainConfig: Record<string, { start: string; symbol: string, deadFrom?: string, extraSymbols?: string[] }> = {
  [CHAIN.ETHEREUM]: { start: '2021-04-11', symbol: 'ETH' },
  [CHAIN.BITCOIN]: { start: '2021-04-11', symbol: 'BTC' },
  [CHAIN.LITECOIN]: { start: '2021-04-11', symbol: 'LTC' },
  [CHAIN.DOGE]: { start: '2022-01-16', symbol: 'DOGE' },
  // dead: Terra Classic collapsed, no THORChain swaps after 2022-05-10. Kept for historical data; returns 0 since.
  [CHAIN.TERRA]: { start: '2022-03-24', deadFrom: '2022-05-10', symbol: 'TERRA' },
  [CHAIN.COSMOS]: { start: '2022-07-05', symbol: 'GAIA' },
  [CHAIN.AVAX]: { start: '2022-09-23', symbol: 'AVAX' },
  // Binance Beacon Chain (feed "BNB", traded 2021-04-11..2024-03-25, ~$8.35M lifetime swap fees) has no
  // DefiLlama chain key, so its pools are attributed to BSC. Start is BNB's first trading day; native BSC
  // pools only start 2023-09-10.
  [CHAIN.BSC]: { start: '2021-04-11', symbol: 'BSC', extraSymbols: ['BNB'] },
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
  // Feed symbols this DefiLlama chain claims (e.g. bsc covers both BSC and the dead BNB Beacon Chain).
  const chainSymbols = new Set([chainShortName, ...(chainConfig[options.chain].extraSymbols || [])]);
  const earningsUrl = `https://gateway.liquify.com/chain/thorchain_midgard/v2/history/earnings?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  // Daily fee components in USD (gross OUTBOUND_FEE, SLASHING_FEE, ...), full history.
  const incomeExpensesUrl = `https://raynalytics.net/api/income-expenses`;
  // Per-chain daily swap volume, full history. Used only to split the network-level outbound/slashing fees
  // across chains by activity share. Different host (no date param), fetched once and reused for every chain.
  const volumeByChainUrl = `https://raynalytics.net/api/swap-volume-fees-by-chain`;

  const earnings = await fetchCacheURL(earningsUrl);
  await sleep(3000);
  const incomeExpenses = await fetchCacheURL(incomeExpensesUrl);
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

  const poolsByChainEarnings: Pool[] = selectedEarningInterval.pools.filter((pool: any) => chainSymbols.has(assetFromString(pool.pool)?.chain as string));

  const runePriceUSD = Number(selectedEarningInterval.runePriceUSD || 0);
  // RUNE amounts are in 1e8 base units; values here are USD fees in the thousands, well within JS precision.
  const toUSD = (runeBaseUnits: any) => (Number(runeBaseUnits) || 0) / 1e8 * runePriceUSD;
  const sumVolume = (rows: any[]) => rows.reduce((acc: number, r: any) => acc + (r.USD_VOLUME || 0), 0);

  // Gross outbound and slashing fees (USD) paid into the Reserve, from raynalytics. Fees must be gross: the old
  // Midgard gasFeeOutbound - gasReimbursement figure was net of gas reimbursed to nodes. NETWORK_FEE (native
  // 0.02 RUNE tx fee) is excluded here - it is already counted in the thorchain CHAIN fees adapter. These are
  // network-wide figures, so we split them across chains by each chain's share of that day's swap volume.
  // The denominator is restricted to the chains we track, so the shares re-normalise to 1 and the network-wide
  // total is preserved.
  const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const incomeRow = incomeExpenses.find((r: any) => r.DAY.slice(0, 10) === dateStr);

  const trackedSymbols = new Set(Object.values(chainConfig).flatMap((c: any) => [c.symbol, ...(c.extraSymbols || [])]));
  const dayVolumeRows = volumeByChain.filter((r: any) => r.DATE.slice(0, 10) === dateStr && trackedSymbols.has(r.CHAIN));
  const totalVolume = sumVolume(dayVolumeRows);
  // Split by swap-volume share. When there is no volume (e.g. exchange halt 2026-05-16..2026-06-21,
  // or raynalytics feed gap) fall back to 0 rather than attributing across chains.
  const volumeShare = totalVolume
    ? sumVolume(dayVolumeRows.filter((r: any) => chainSymbols.has(r.CHAIN))) / totalVolume
    : 0;

  const outboundFee = Math.max(0, Number(incomeRow?.OUTBOUND_FEE || 0) * volumeShare);
  const slashingFee = Math.max(0, Number(incomeRow?.SLASHING_FEE || 0) * volumeShare);
  // EXPENSES = outbound gas the Reserve reimburses to nodes (verified vs Midgard gasReimbursement). It is paid
  // out of the gross outbound fee to nodes, so it is supply-side; the protocol keeps outbound minus this.
  // Capped at the outbound fee so the protocol-kept remainder never goes negative and Fees = Revenue +
  // SupplySideRevenue holds exactly.
  const gasReimbursement = Math.min(Number(incomeRow?.EXPENSES || 0), Number(incomeRow?.OUTBOUND_FEE || 0)) * volumeShare;
  const outboundToProtocol = outboundFee - gasReimbursement;

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
  // share, affiliate (integrator) fees, TCY rewards and the gas reimbursed to nodes all pay suppliers ->
  // supply. The protocol-kept outbound remainder, slashing and the developer/marketing funds -> protocol.
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(swapFees, 'Swap Fees');
  dailyFees.addUSDValue(outboundFee, 'Outbound Fees');
  dailyFees.addUSDValue(slashingFee, 'Slashing Fees');
  dailyFees.addUSDValue(affiliateFees, 'Affiliate Fees');

  // Slashing is paid by misbehaving nodes, not users, so it is excluded from user fees.
  const dailyUserFees = options.createBalances();
  dailyUserFees.addUSDValue(swapFees, 'Swap Fees');
  dailyUserFees.addUSDValue(outboundFee, 'Outbound Fees');
  dailyUserFees.addUSDValue(affiliateFees, 'Affiliate Fees');

  // RUNE-holder value is only the RUNE burn - the single component that accrues to every RUNE holder.
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addUSDValue(burn, 'RUNE Burn');

  // Supply-side value: the node-operator (RUNE bonder) share is a security cost, the LP share pays
  // liquidity providers, affiliate fees pass through to integrators, TCY rewards pay TCY stakers, and the
  // gas reimbursement covers nodes' outbound gas costs.
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(nodeRevenue, 'Swap Fees To RUNE Bonders');
  dailySupplySideRevenue.addUSDValue(lpRevenue, 'Swap Fees To LPs');
  dailySupplySideRevenue.addUSDValue(affiliateFees, 'Affiliate Fees To Integrators');
  dailySupplySideRevenue.addUSDValue(tcy, 'TCY Staker Rewards');
  dailySupplySideRevenue.addUSDValue(gasReimbursement, 'Gas Reimbursement');

  // Revenue = protocol-kept income (outbound net of gas reimbursement + slashing + dev + marketing) + the RUNE
  // burn. The node-bonder share is a security cost and the LP/affiliate/TCY shares pay suppliers, so none of
  // those count as revenue.
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addUSDValue(outboundToProtocol, 'Outbound Fees');
  dailyProtocolRevenue.addUSDValue(slashingFee, 'Slashing Fees');
  dailyProtocolRevenue.addUSDValue(dev, 'Developer Fund');
  dailyProtocolRevenue.addUSDValue(marketing, 'Marketing Fund');

  const dailyRevenue = options.createBalances();
  dailyRevenue.addUSDValue(burn, 'RUNE Burn');
  dailyRevenue.addUSDValue(outboundToProtocol, 'Outbound Fees');
  dailyRevenue.addUSDValue(slashingFee, 'Slashing Fees');
  dailyRevenue.addUSDValue(dev, 'Developer Fund');
  dailyRevenue.addUSDValue(marketing, 'Marketing Fund');

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
  Fees: "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools, gross outbound fees and slashing fees paid into the Reserve, and affiliate fees charged by interfaces/wallets (affiliate fees are attributed to the THORChain native chain). RUNE block-reward emissions and the native tx fee (counted in the THORChain chain fees adapter) are excluded.",
  UserFees: "All swap, outbound and affiliate fees paid by users when swapping through THORChain (slashing is paid by nodes, not users).",
  Revenue: "The 5% of swap fees burned as RUNE (value to all RUNE holders) plus protocol-kept income (outbound fees net of the gas reimbursed to nodes, slashing fees, developer fund and marketing fund). The node-bonder share of swap fees is treated as a security cost and the LP, affiliate and TCY shares as supplier payments, so none of those count as revenue.",
  ProtocolRevenue: "Income kept by the protocol: outbound fees net of the gas reimbursed to nodes, slashing fees paid into the Reserve, plus the 5% developer fund and 5% marketing fund taken from swap fees.",
  HoldersRevenue: "Value to RUNE holders: the 5% of swap fees burned as RUNE (permanently removed from supply), the only component that accrues to every RUNE holder.",
  SupplySideRevenue: "Value paid to suppliers: the node-operator (RUNE bonder) share of swap fees set by the Incentive Pendulum (a security cost), the liquidity-provider share of swap fees (LP side of the Incentive Pendulum), affiliate fees passed through to integrators, the 10% of swap fees paid to TCY stakers, and the outbound gas costs reimbursed from the Reserve to nodes.",
};

const outboundNote = "Gross outbound fees charged to users and paid into the Reserve, a network-level figure split across chains by each chain's share of daily swap volume.";
const outboundNetNote = "Outbound fees kept by the protocol: gross outbound fees charged to users minus the gas reimbursed to nodes, a network-level figure split across chains by each chain's share of daily swap volume.";
const slashingNote = "Fees slashed from misbehaving nodes and paid into the Reserve, a network-level figure split across chains by each chain's share of daily swap volume.";

const breakdownMethodology = {
  Fees: {
    'Swap Fees': "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools.",
    'Outbound Fees': outboundNote,
    'Slashing Fees': slashingNote,
    'Affiliate Fees': "Fees charged by the interface or wallet that built the swap (attributed to the THORChain native chain).",
  },
  UserFees: {
    'Swap Fees': "Slip-based liquidity (swap) fees paid by users on each chain's THORChain pools.",
    'Outbound Fees': outboundNote,
    'Affiliate Fees': "Fees charged by the interface or wallet that built the swap (attributed to the THORChain native chain).",
  },
  Revenue: {
    'RUNE Burn': "5% of swap fees burned, permanently removing RUNE from supply (since 2024-09-16).",
    'Outbound Fees': outboundNetNote,
    'Slashing Fees': slashingNote,
    'Developer Fund': "5% of swap fees allocated to the developer fund (since 2024-09-16).",
    'Marketing Fund': "5% of swap fees allocated to the marketing fund (since 2025-11-04).",
  },
  ProtocolRevenue: {
    'Outbound Fees': outboundNetNote,
    'Slashing Fees': slashingNote,
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
    'Gas Reimbursement': "Outbound gas costs reimbursed from the Reserve to the nodes that broadcast outbound transactions, paid out of the gross outbound fee.",
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
