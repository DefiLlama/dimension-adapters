import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { fetchLighterPartnerStats, LIGHTER_PARTNER_FEES_LABEL, type LighterAccountConfig } from "../helpers/lighter";

// https://disciple.vip/docs/reference/contracts
const LAUNCHPAD = "0xe43F360DC65C9Ba1B7a835BDaa10Fb31f6DC52E5";
const MIGRATION = "0x0fCD7FE98Eed9234A1d1c2aAb6AEec210809747b";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"; // Uniswap v4 PoolManager
const FORWARDER = "0x346e7ff1c9d088113a659b5b0ac2c2f4efd52b4b"; // DisciplePermitForwarder
const TEAM_TREASURY = "0x2447C5065eEDA71ed6d4A2D0347b48eA3B211E30"; // receives the 7% skin market fee
const DEPLOY_BLOCK = 118816228;
const COIN_CONTRACTS_START = "2026-11-20";

// Constants.TRADE_FEE_BPS and FEE_SHARE_* in the DISCIPLE contracts
const TRADE_FEE_BPS = 100n;
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
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const LABEL = {
  tradingFees: METRIC.TRADING_FEES,
  creatorTax: "Creator Tax",
  sniperTax: "Sniper Tax",
  crewTips: "Crew Tips",
  turbo: LIGHTER_PARTNER_FEES_LABEL,
  skinMarket: "Skin Market Fees",
  toCreators: "Trading Fees To Creators",
  toLockedLiquidity: "Trading Fees To Locked Liquidity",
  toTreasury: "Trading Fees To Treasury",
  toCommunity: "Trading Fees To Community Rewards",
  creatorTaxToCreators: "Creator Tax To Creators",
  sniperTaxToHolders: "Sniper Tax To Liquidity And Holders",
  crewTipsToHolders: "Crew Tips To Holders",
};

// DISCIPLE Turbo partner accounts on each Lighter deployment
const chainConfig: Record<string, { start: string; turboAccounts: LighterAccountConfig[] }> = {
  [CHAIN.ROBINHOOD]: { start: "2026-11-18", turboAccounts: [{ index: "55689", start: "2026-11-18", end: "2026-11-18" }] },
  [CHAIN.ZK_LIGHTER]: { start: "2026-11-18", turboAccounts: ["769803"] },
};

export async function getMarkets(options: FetchOptions) {
  const toBlock = await options.getToBlock();
  const [launches, migrations] = await Promise.all([
    options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCHED, fromBlock: DEPLOY_BLOCK, toBlock, cacheInCloud: true }),
    options.getLogs({ target: MIGRATION, eventAbi: MIGRATED, fromBlock: DEPLOY_BLOCK, toBlock, cacheInCloud: true }),
  ]);
  const curves: Record<string, { quote: string; taxBps: bigint }> = {};
  for (const l of launches) curves[l.curve.toLowerCase()] = { quote: l.quote, taxBps: BigInt(l.creatorTaxBps) };
  const pools: Record<string, { quote: string; quoteIs0: boolean }> = {};
  for (const m of migrations) pools[m.poolId.toLowerCase()] = { quote: m.quote, quoteIs0: BigInt(m.quote) < BigInt(m.token) };
  return { curves, pools };
}

async function addSkinMarketFees(options: FetchOptions, dailyFees: any, dailyRevenue: any) {
  const withdraws = await options.getLogs({ target: FORWARDER, eventAbi: WITHDRAWN });
  for (const w of withdraws) {
    if (w.to.toLowerCase() !== TEAM_TREASURY.toLowerCase()) continue;
    dailyFees.add(w.token, w.net, LABEL.skinMarket);
    dailyRevenue.add(w.token, w.net, LABEL.skinMarket);
  }
}

async function addCoinFees(options: FetchOptions, dailyFees: any, dailyRevenue: any, dailySupplySideRevenue: any) {
  const { curves, pools } = await getMarkets(options);

  const addTradingFee = (quote: string, feeRaw: bigint) => {
    const fee = Number(feeRaw);
    dailyFees.add(quote, fee, LABEL.tradingFees);
    dailySupplySideRevenue.add(quote, fee * CREATOR_SHARE, LABEL.toCreators);
    dailySupplySideRevenue.add(quote, fee * LP_SHARE, LABEL.toLockedLiquidity);
    dailyRevenue.add(quote, fee * TREASURY_SHARE, LABEL.toTreasury);
    dailyRevenue.add(quote, fee * COMMUNITY_SHARE, LABEL.toCommunity);
  };

  const curveList = Object.keys(curves);
  if (curveList.length) {
    const [trades, tips] = await Promise.all([
      options.getLogs({ targets: curveList, eventAbi: TRADE, flatten: false }),
      options.getLogs({ targets: curveList, eventAbi: CREW_TIP, flatten: false }),
    ]);
    curveList.forEach((curve, i) => {
      const { quote, taxBps } = curves[curve];
      for (const t of trades[i]) {
        const fee = BigInt(t.fee); // trading fee + creator tax, both in bps of the same notional
        const tradingFee = (fee * TRADE_FEE_BPS) / (TRADE_FEE_BPS + taxBps);
        addTradingFee(quote, tradingFee);
        dailyFees.add(quote, fee - tradingFee, LABEL.creatorTax);
        dailySupplySideRevenue.add(quote, fee - tradingFee, LABEL.creatorTaxToCreators);
        dailyFees.add(quote, t.snipeFee, LABEL.sniperTax);
        dailySupplySideRevenue.add(quote, t.snipeFee, LABEL.sniperTaxToHolders);
      }
      for (const t of tips[i]) {
        dailyFees.add(quote, t.tax, LABEL.crewTips);
        dailySupplySideRevenue.add(quote, t.tax, LABEL.crewTipsToHolders);
      }
    });
  }

  // graduated pools: the hook keeps 1% of each swap, booked as 1% of the quote leg
  const poolIds = Object.keys(pools);
  if (poolIds.length) {
    const swaps = await options.getLogs({ target: POOL_MANAGER, eventAbi: SWAP, topics: [SWAP_TOPIC, poolIds] as any });
    for (const s of swaps) {
      const { quote, quoteIs0 } = pools[s.id.toLowerCase()];
      const quoteAmount = BigInt(quoteIs0 ? s.amount0 : s.amount1);
      addTradingFee(quote, ((quoteAmount < 0n ? -quoteAmount : quoteAmount) * TRADE_FEE_BPS) / 10_000n);
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { dailyFees: turboFees } = await fetchLighterPartnerStats(options, chainConfig[options.chain].turboAccounts);
  dailyFees.addBalances(turboFees);
  dailyRevenue.addBalances(turboFees);

  if (options.chain === CHAIN.ROBINHOOD && options.dateString >= COIN_CONTRACTS_START) {
    await addSkinMarketFees(options, dailyFees, dailyRevenue);
    await addCoinFees(options, dailyFees, dailyRevenue, dailySupplySideRevenue);
  }

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "The 1% trading fee on DISCIPLE bonding curves and Uniswap v4 hook pools, the optional creator tax, the launch sniper tax, Easy-mode crew tips, the DISCIPLE partner fee on Turbo perps trades routed to Lighter and the 7% fee on skin market sales.",
  UserFees: "Traders and skin market users pay the 1% trading fee, creator tax, sniper tax, crew tips, Turbo partner fees and the 7% skin market fee.",
  Revenue: "34% of the 1% trading fee (33% Team treasury Safe + 1% community rewards Safe), plus all Turbo partner fees and skin market fees.",
  ProtocolRevenue: "34% of the 1% trading fee (33% Team treasury Safe + 1% community rewards Safe), plus all Turbo partner fees and skin market fees.",
  SupplySideRevenue: "Coin creators (33% of the trading fee plus any creator tax), locked liquidity (33% of the trading fee), sniper tax sent to locked liquidity or holder rewards, and crew tips paid to holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.tradingFees]: "1% fee on every bonding curve trade and every swap in a graduated DISCIPLE Uniswap v4 pool.",
    [LABEL.creatorTax]: "Optional extra tax set by the coin creator at launch, charged on bonding curve trades.",
    [LABEL.sniperTax]: "Decaying tax (99% to 0%) on trades in the first 7 seconds after launch.",
    [LABEL.crewTips]: "Easy-mode tip of 0.777% of sell proceeds.",
    [LABEL.turbo]: "DISCIPLE partner fee on Turbo perps trades executed on Lighter.",
    [LABEL.skinMarket]: "7% fee on every skin market sale, paid in USDG.",
  },
  Revenue: {
    [LABEL.toTreasury]: "33% of the trading fee, paid to the Team treasury Safe.",
    [LABEL.toCommunity]: "1% of the trading fee, paid to the community rewards Safe.",
    [LABEL.turbo]: "Turbo partner fees, kept by the Team.",
    [LABEL.skinMarket]: "Skin market fees, paid to the Team treasury Safe.",
  },
  ProtocolRevenue: {
    [LABEL.toTreasury]: "33% of the trading fee, paid to the Team treasury Safe.",
    [LABEL.toCommunity]: "1% of the trading fee, paid to the community rewards Safe.",
    [LABEL.turbo]: "Turbo partner fees, kept by the Team.",
    [LABEL.skinMarket]: "Skin market fees, paid to the Team treasury Safe.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "33% of the trading fee, paid to the coin creator.",
    [LABEL.toLockedLiquidity]: "33% of the trading fee, added to the coin's locked liquidity.",
    [LABEL.creatorTaxToCreators]: "Creator tax, paid in full to the coin creator.",
    [LABEL.sniperTaxToHolders]: "Sniper tax, sent to the coin's locked liquidity or holder rewards.",
    [LABEL.crewTipsToHolders]: "Crew tips, paid to the coin's other holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
