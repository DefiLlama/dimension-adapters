// DISCIPLE: fees & revenue adapter.
//
// DISCIPLE (https://disciple.vip, https://x.com/disciplevip) is a coin launchpad on Robinhood Chain (chainId 4663).
// Every coin trades on its own BondingCurve clone until it graduates; Migration then moves the liquidity into a
// Uniswap v4 pool that runs the DISCIPLE hook, held for good by LockedLP. Contract list:
// https://disciple.vip/docs/reference/contracts
//
// Fees users pay (all in the coin's quote token: USDG or a pair token):
//   - Trade fee: 1% of every trade (Constants.TRADE_FEE_BPS = 100), on the curve and after graduation (hook).
//     Split 33% coin creator / 33% locked liquidity / 33% Team treasury / 1% community rewards Safe
//     (Constants.FEE_SHARE_CREATOR / FEE_SHARE_LP_LOCK / FEE_SHARE_TREASURY / FEE_SHARE_REFERRAL).
//   - Creator tax: optional extra % set by the creator at launch, fixed for the coin, curve phase only, 100% to the creator.
//   - Sniper tax: the first 7 seconds after launch carry a decaying tax (99% -> 0%), escrowed by the curve and sent to
//     the coin's locked liquidity or holder rewards; the Team keeps none of it.
//   - Crew tip (Easy mode coins): 0.777% of sell proceeds paid to the coin's other holders.
//
// Curve phase: read per trade from BondingCurve Trade events (`fee` = 1% + creator tax, `snipeFee` separate), so fees
// land in the hour the trade happened (the curve settles the split to CurveFeeVault later in batches).
// Pool phase: the hook keeps 1% of each swap's output side and pays the split when anyone claims. The adapter books
// it at swap time as 1% of the quote side of each PoolManager Swap on a DISCIPLE pool.
//
// Turbo (perps duels/climb in the app) trades on Lighter. DISCIPLE charges a partner fee of 0.05 bp per side, paid to
// its Lighter partner account and kept by the Team. Read from Lighter's partnerStats endpoint (helpers/lighter.ts):
//   - zklighter (Lighter main): account 769803, live since 2026-11-18.
//   - Lighter on Robinhood Chain: account 55689, used only on 2026-11-18 before Turbo moved to Lighter main.
//
// Skin market (https://disciple.vip/market): players buy and sell cosmetic items for USDG. Every sale pays a 7% fee
// (web/lib/market.ts MARKET_FEE_BPS = 700) as its own gasless withdraw through DisciplePermitForwarder straight to the
// Team treasury Safe. Counted from the forwarder's Withdrawn events whose destination is the Safe, so the Safe's fee
// claims from the coin contracts (already counted above at trade time) are not counted twice. Kept by the Team.
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { fetchLighterPartnerStats, LIGHTER_PARTNER_FEES_LABEL } from "../helpers/lighter";

const LAUNCHPAD = "0xe43F360DC65C9Ba1B7a835BDaa10Fb31f6DC52E5";
const MIGRATION = "0x0fCD7FE98Eed9234A1d1c2aAb6AEec210809747b";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager on Robinhood Chain
const FORWARDER = "0x346e7ff1c9d088113a659b5b0ac2c2f4efd52b4b"; // DisciplePermitForwarder (gasless USDG transfers)
const TEAM_TREASURY = "0x2447C5065eEDA71ed6d4A2D0347b48eA3B211E30"; // Team treasury Safe, receives the 7% market fee
const DEPLOY_BLOCK = 118816228; // DISCIPLE mainnet deploy, 2026-11-20

const TRADE_FEE = 0.01; // 1% trade fee
const CREATOR_SHARE = 0.33;
const LP_SHARE = 0.33;
const TREASURY_SHARE = 0.33;
const COMMUNITY_SHARE = 0.01;

const LAUNCHED = "event Launched(address indexed token, address indexed curve, address indexed creator, address quote, string name, string ticker, uint256 creatorTaxBps)";
const MIGRATED = "event Migrated(address indexed token, address indexed quote, bytes32 poolId, uint256 tokenAmount, uint256 quoteAmount, uint160 sqrtPriceX96)";
const TRADE = "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 quoteAmt, uint256 tokenAmt, uint256 fee, uint256 snipeFee, uint256 priceBeforeX18, uint256 priceAfterX18, uint256 impactBps, uint256 mcapAfterUsd)";
const CREW_TIP = "event ProfitTaxCharged(address indexed token, address indexed seller, uint256 tax, uint256 grossQuote, uint256 costBasis)";
const WITHDRAWN = "event Withdrawn(address indexed owner, address indexed token, address indexed to, uint256 net, uint256 fee, address feeTo)";
const SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
// keccak256('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'), the Uniswap v4 PoolManager Swap event
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const LABEL = {
  creator: METRIC.CREATOR_FEES,
  lp: METRIC.LP_FEES,
  treasury: "Trade Fees To Treasury",
  community: "Trade Fees To Community Rewards",
  sniper: "Sniper Tax",
  crewTip: "Crew Tips",
  turbo: LIGHTER_PARTNER_FEES_LABEL,
  market: "Skin Market Fees",
};

const TURBO_ACCOUNTS: Record<string, any[]> = {
  [CHAIN.ZK_LIGHTER]: ["769803"],
  [CHAIN.ROBINHOOD]: [{ index: "55689", start: "2026-11-18", end: "2026-11-18" }],
};

const abs = (v: any) => { const n = BigInt(v); return n < 0n ? -n : n; };

// Coins (curve, quote, creator tax) and graduated pools (pool id -> quote, quote side), from deploy block to now.
export async function getMarkets(options: FetchOptions) {
  const toBlock = await options.getToBlock();
  const [launches, migrations] = await Promise.all([
    options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCHED, fromBlock: DEPLOY_BLOCK, toBlock, cacheInCloud: true }),
    options.getLogs({ target: MIGRATION, eventAbi: MIGRATED, fromBlock: DEPLOY_BLOCK, toBlock, cacheInCloud: true }),
  ]);
  const curves: Record<string, { token: string; quote: string; taxBps: bigint }> = {};
  for (const l of launches) curves[l.curve.toLowerCase()] = { token: l.token, quote: l.quote, taxBps: BigInt(l.creatorTaxBps) };
  const pools: Record<string, { quote: string; quoteIs0: boolean }> = {};
  for (const m of migrations) pools[m.poolId.toLowerCase()] = { quote: m.quote, quoteIs0: BigInt(m.quote) < BigInt(m.token) };
  return { curves, pools };
}

// Quote-side size of every swap in a DISCIPLE pool this period ([quote, amount] pairs), read from the shared
// PoolManager filtered by pool id (50 ids per request).
export async function getPoolSwaps(options: FetchOptions, pools: Record<string, { quote: string; quoteIs0: boolean }>) {
  const ids = Object.keys(pools);
  const out: [string, bigint][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const swaps = await options.getLogs({ target: POOL_MANAGER, eventAbi: SWAP, topics: [SWAP_TOPIC, ids.slice(i, i + 50)] as any } as any);
    for (const s of swaps) {
      const pool = pools[s.id.toLowerCase()];
      if (!pool) continue;
      out.push([pool.quote, abs(pool.quoteIs0 ? s.amount0 : s.amount1)]);
    }
  }
  return out;
}

// Turbo partner fees: all kept by the Team.
async function addTurboFees(options: FetchOptions, dailyFees: any, dailyRevenue: any) {
  if (options.dateString > "2026-11-18" && options.chain === CHAIN.ROBINHOOD) return; // RH partner account retired
  const { dailyFees: turbo } = await fetchLighterPartnerStats(options, TURBO_ACCOUNTS[options.chain]);
  dailyFees.addBalances(turbo);
  dailyRevenue.addBalances(turbo);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  await addTurboFees(options, dailyFees, dailyRevenue);
  // Coin contracts live on Robinhood Chain from 2026-11-20 (deploy block 118816228).
  if (options.chain === CHAIN.ZK_LIGHTER || options.dateString < "2026-11-20")
    return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  // Skin market 7%: gasless withdraws whose destination is the Team treasury Safe.
  const withdraws = await options.getLogs({ target: FORWARDER, eventAbi: WITHDRAWN });
  for (const w of withdraws) {
    if (w.to.toLowerCase() !== TEAM_TREASURY.toLowerCase()) continue;
    dailyFees.add(w.token, w.net, LABEL.market);
    dailyRevenue.add(w.token, w.net, LABEL.market);
  }

  const { curves, pools } = await getMarkets(options);
  const curveList = Object.keys(curves);

  const addTradeFee = (quote: string, protoFee: number) => {
    dailyFees.add(quote, protoFee * CREATOR_SHARE, LABEL.creator);
    dailyFees.add(quote, protoFee * LP_SHARE, LABEL.lp);
    dailyFees.add(quote, protoFee * TREASURY_SHARE, LABEL.treasury);
    dailyFees.add(quote, protoFee * COMMUNITY_SHARE, LABEL.community);
    dailySupplySideRevenue.add(quote, protoFee * CREATOR_SHARE, LABEL.creator);
    dailySupplySideRevenue.add(quote, protoFee * LP_SHARE, LABEL.lp);
    dailyRevenue.add(quote, protoFee * TREASURY_SHARE, LABEL.treasury);
    dailyRevenue.add(quote, protoFee * COMMUNITY_SHARE, LABEL.community);
  };

  if (curveList.length) {
    // Curve phase
    const [trades, tips] = await Promise.all([
      options.getLogs({ targets: curveList, eventAbi: TRADE, flatten: false }),
      options.getLogs({ targets: curveList, eventAbi: CREW_TIP, flatten: false }),
    ]);
    trades.forEach((logs: any[], i: number) => {
      const { quote, taxBps } = curves[curveList[i]];
      for (const t of logs) {
        const fee = BigInt(t.fee);
        // `fee` = 1% (100 bps) + creator tax (taxBps), both on the same notional.
        const protoFee = (fee * 100n) / (100n + taxBps);
        const creatorTax = fee - protoFee;
        addTradeFee(quote, Number(protoFee));
        if (creatorTax > 0n) {
          dailyFees.add(quote, creatorTax, LABEL.creator);
          dailySupplySideRevenue.add(quote, creatorTax, LABEL.creator);
        }
        if (BigInt(t.snipeFee) > 0n) {
          dailyFees.add(quote, t.snipeFee, LABEL.sniper);
          dailySupplySideRevenue.add(quote, t.snipeFee, LABEL.sniper);
        }
      }
    });
    tips.forEach((logs: any[], i: number) => {
      const { quote } = curves[curveList[i]];
      for (const t of logs) {
        dailyFees.add(quote, t.tax, LABEL.crewTip);
        dailySupplySideRevenue.add(quote, t.tax, LABEL.crewTip);
      }
    });
  }

  // Pool phase: the hook's 1% is taken on the swap's output side; in quote terms that is 1% of the quote leg.
  for (const [quote, amount] of await getPoolSwaps(options, pools)) addTradeFee(quote, Number(amount) * TRADE_FEE);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "All fees traders pay on DISCIPLE coins (the 1% trade fee on bonding curves and Uniswap v4 hook pools, the optional creator tax, the launch sniper tax, Easy-mode crew tips) plus the DISCIPLE partner fee on Turbo perps trades routed to Lighter and the 7% fee on skin market sales.",
  UserFees: "Same as Fees: every fee is paid by traders.",
  Revenue: "The Team's 34% of the 1% coin trade fee (33% treasury Safe + 1% community rewards Safe), plus all Turbo partner fees and skin market fees.",
  ProtocolRevenue: "The Team's 34% of the 1% coin trade fee (33% treasury Safe + 1% community rewards Safe), plus all Turbo partner fees and skin market fees.",
  SupplySideRevenue: "Coin creators (33% of the trade fee plus any creator tax), locked liquidity (33%), sniper tax sent to locked liquidity or holder rewards, and crew tips paid to holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.creator]: "33% of the 1% trade fee plus the optional creator tax, paid to the coin creator.",
    [LABEL.lp]: "33% of the 1% trade fee, added to the coin's locked liquidity.",
    [LABEL.treasury]: "33% of the 1% trade fee, paid to the Team treasury.",
    [LABEL.community]: "1% of the 1% trade fee, paid to the community rewards Safe.",
    [LABEL.sniper]: "Decaying tax on trades in the first 7 seconds after launch, sent to locked liquidity or holder rewards.",
    [LABEL.crewTip]: "Easy-mode tip (0.777% of sell proceeds) paid to the coin's other holders.",
    [LABEL.turbo]: "DISCIPLE partner fee (0.05 bp per side) on Turbo perps trades executed on Lighter.",
    [LABEL.market]: "7% fee on every skin market sale, paid in USDG to the Team treasury Safe.",
  },
  Revenue: {
    [LABEL.treasury]: "33% of the 1% trade fee, paid to the Team treasury.",
    [LABEL.community]: "1% of the 1% trade fee, paid to the Team's community rewards Safe.",
    [LABEL.turbo]: "Turbo partner fees, kept by the Team.",
    [LABEL.market]: "Skin market fees, kept by the Team.",
  },
  ProtocolRevenue: {
    [LABEL.treasury]: "33% of the 1% trade fee, paid to the Team treasury.",
    [LABEL.community]: "1% of the 1% trade fee, paid to the Team's community rewards Safe.",
    [LABEL.turbo]: "Turbo partner fees, kept by the Team.",
    [LABEL.market]: "Skin market fees, kept by the Team.",
  },
  SupplySideRevenue: {
    [LABEL.creator]: "Creator share of the trade fee plus creator tax.",
    [LABEL.lp]: "Locked liquidity share of the trade fee.",
    [LABEL.sniper]: "Sniper tax sent to locked liquidity or holder rewards.",
    [LABEL.crewTip]: "Crew tips paid to holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-11-18" }, // Turbo on Lighter RH 2026-11-18; coin contracts from 2026-11-20 (no logs before)
    [CHAIN.ZK_LIGHTER]: { start: "2026-11-18" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
