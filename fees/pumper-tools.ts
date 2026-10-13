import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Pumper (pumper.tools) on Stable: a token launchpad plus the PUMPER token.
//
// Launched tokens are discovered from PumperProtocolRegistry's TokenRegistered
// events -- every launchpad generation registers its launches there, so this
// is exactly Pumper's own tokens and nothing else on the shared Uniswap
// factories. Revenue shows up in three ways depending on the launchpad:
//
//  1. V3 launchpads: each token has a 1% Uniswap V3 pool. The pool's swap fee
//     is harvested into the token's revenue pot.
//  2. V3 launchpads v8+: an optional creator-set buy/sell tax, taken only on
//     trades through the launchpad itself (Bought/Sold events), paid into
//     the same pot.
//  3. V4 and Lock launchpads: the registry stores the V4 PoolManager instead
//     of a pool. Their hook takes a 1% base fee plus the creator's tax on
//     every swap (and the Lock launchpad also taxes curve trades); all of it
//     is reported to the launchpad's PumperRevenueSplitterV4 as TaxNotified.
//
// Every pot is split the same way (fixed contract constants): 10% adminVault
// (protocol), 5% FEFER buy-and-burn vault, 5% PUMPER buy-and-burn vault, 80%
// to the token's creator / stakers / buyback / liquidity, in a ratio the
// creator fixes at launch.
//
// PUMPER itself was not launched through the launchpad and takes no protocol
// cut: its pools' fees go to their LPs (the LP positions parked in Pumper's
// gauge pass them on to PUMPER stakers). The pre-relaunch PUMPER was
// backfilled into the registry and is excluded from the launchpad set.
//
// Fees are measured on the stablecoin leg only. Pools are paired against
// USDT0 (6dp) or WgUSDT (18dp), and the pair is read from each pool's own
// token0()/token1() rather than assumed.

const REGISTRY = "0x7Cd190e5Ba34C1Ec8FE07F78EddB026719940492";
const REGISTRY_DEPLOY_BLOCK = 32938134;
const TOKEN_REGISTERED_EVENT =
  "event TokenRegistered(address indexed token, address indexed creator, address pool, address indexed launchpad)";
const V3_SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const BOUGHT_EVENT = "event Bought(address indexed token, address indexed buyer, uint256 quoteIn, uint256 tokensOut)";
const SOLD_EVENT = "event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 quoteOut)";
const TAX_NOTIFIED_EVENT = "event TaxNotified(address indexed token, address indexed hook, uint256 amount)";

const QUOTE_ASSETS = new Set([
  "0x817997ca8394e26cce3de3a076a4889b27dbf9de", // WgUSDT
  "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0
]);
const EXCLUDED_TOKENS = new Set([
  "0x79f09782c17d614b43cfee9b85da191da0db940a", // pre-relaunch PUMPER
]);
const PUMPER_POOLS = [
  "0xb632ceecab5fea94bb0d1c8fd6df34288c249eef", // PUMPER/USDT0 1%
  "0xe545c5737b424050d39524d2231a20dd9b1b4eb2", // PUMPER/WgUSDT 1%
];

const FEE_FRACTION = 0.01; // every Pumper pool uses the 1% tier
const BPS = 10_000;
const ADMIN_VAULT_RATIO = 0.10;
const FEFER_VAULT_RATIO = 0.05;
const PUMPER_VAULT_RATIO = 0.05;
const SUPPLY_SIDE_RATIO = 1 - ADMIN_VAULT_RATIO - FEFER_VAULT_RATIO - PUMPER_VAULT_RATIO; // 80%

const SWAP_FEES = "Launched Token Swap Fees";
const TRADE_TAX = "Launched Token Trade Tax";
const V4_HOOK_FEES = "V4 And Lock Hook Base Fee Plus Trade Tax";
const PUMPER_SWAP_FEES = "PUMPER Swap Fees";
const TO_ADMIN_VAULT = "Fees To Admin Vault";
const TO_FEFER_VAULT = "Fees To Fefer Vault";
const TO_PUMPER_VAULT = "Fees To Pumper Vault";
const TO_CREATORS_AND_STAKERS = "Fees To Creators And Token Stakers";
const PUMPER_TO_LPS = "PUMPER Swap Fees To LPs";

const abs = (v: any) => {
  const n = BigInt(v);
  return Number(n < 0n ? -n : n);
};

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { api, getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const addLaunchpadRevenue = (quote: string, amount: number, label: string) => {
    dailyFees.add(quote, amount, label);
    dailyRevenue.add(quote, amount * ADMIN_VAULT_RATIO, TO_ADMIN_VAULT);
    dailyRevenue.add(quote, amount * FEFER_VAULT_RATIO, TO_FEFER_VAULT);
    dailyRevenue.add(quote, amount * PUMPER_VAULT_RATIO, TO_PUMPER_VAULT);
    dailyProtocolRevenue.add(quote, amount * ADMIN_VAULT_RATIO, TO_ADMIN_VAULT);
    dailySupplySideRevenue.add(quote, amount * SUPPLY_SIDE_RATIO, TO_CREATORS_AND_STAKERS);
  };

  const registered = (await getLogs({
    target: REGISTRY,
    eventAbi: TOKEN_REGISTERED_EVENT,
    fromBlock: REGISTRY_DEPLOY_BLOCK,
    cacheInCloud: true,
  })).filter((log: any) => !EXCLUDED_TOKENS.has(log.token.toLowerCase()));

  // Resolve every registered "pool": a V3 pool answers token0/token1, the V4
  // PoolManager doesn't.
  const poolAddrs = [...new Set(registered.map((log: any) => log.pool.toLowerCase()))].concat(PUMPER_POOLS);
  const [token0s, token1s] = await Promise.all([
    api.multiCall({ abi: "address:token0", calls: poolAddrs, permitFailure: true }),
    api.multiCall({ abi: "address:token1", calls: poolAddrs, permitFailure: true }),
  ]);
  const poolQuote: Record<string, { quote: string; isToken0: boolean }> = {};
  poolAddrs.forEach((pool, i) => {
    const token0 = token0s[i]?.toLowerCase();
    const token1 = token1s[i]?.toLowerCase();
    if (!token0 || !token1) return;
    if (QUOTE_ASSETS.has(token0)) poolQuote[pool] = { quote: token0, isToken0: true };
    else if (QUOTE_ASSETS.has(token1)) poolQuote[pool] = { quote: token1, isToken0: false };
  });

  const v3Launches = registered.filter((log: any) => poolQuote[log.pool.toLowerCase()]);
  const v4Launches = registered.filter((log: any) => !poolQuote[log.pool.toLowerCase()]);

  // 1 + PUMPER: 1% swap fee on every V3 pool, stablecoin leg.
  const v3Pools = [...new Set(v3Launches.map((log: any) => log.pool.toLowerCase()))];
  const swapPools = v3Pools.concat(PUMPER_POOLS.filter((p) => poolQuote[p]));
  const swapLogs = await getLogs({ targets: swapPools, eventAbi: V3_SWAP_EVENT, flatten: false });
  swapLogs.forEach((logs: any[], i: number) => {
    const pool = swapPools[i];
    const { quote, isToken0 } = poolQuote[pool];
    const isPumper = PUMPER_POOLS.includes(pool);
    for (const log of logs ?? []) {
      const fee = abs(isToken0 ? log.amount0 : log.amount1) * FEE_FRACTION;
      if (isPumper) {
        dailyFees.add(quote, fee, PUMPER_SWAP_FEES);
        dailySupplySideRevenue.add(quote, fee, PUMPER_TO_LPS);
      } else {
        addLaunchpadRevenue(quote, fee, SWAP_FEES);
      }
    }
  });

  // 2: buy/sell tax on V3 launchpads. Rates are fixed per token at launch;
  // launchpads older than v8 have no tax getter and fail the call.
  const taxCalls = v3Launches.map((log: any) => ({ target: log.launchpad, params: [log.token] }));
  const [buyTaxes, sellTaxes] = await Promise.all([
    api.multiCall({ abi: "function buyTaxBps(address) view returns (uint16)", calls: taxCalls, permitFailure: true }),
    api.multiCall({ abi: "function sellTaxBps(address) view returns (uint16)", calls: taxCalls, permitFailure: true }),
  ]);
  const taxOf: Record<string, { buy: number; sell: number; quote: string }> = {};
  v3Launches.forEach((log: any, i: number) => {
    const buy = Number(buyTaxes[i] ?? 0);
    const sell = Number(sellTaxes[i] ?? 0);
    if (buy || sell) taxOf[log.token.toLowerCase()] = { buy, sell, quote: poolQuote[log.pool.toLowerCase()].quote };
  });
  const taxedLaunchpads = [...new Set(v3Launches
    .filter((log: any) => taxOf[log.token.toLowerCase()])
    .map((log: any) => log.launchpad.toLowerCase()))];
  if (taxedLaunchpads.length) {
    const [bought, sold] = await Promise.all([
      getLogs({ targets: taxedLaunchpads, eventAbi: BOUGHT_EVENT }),
      getLogs({ targets: taxedLaunchpads, eventAbi: SOLD_EVENT }),
    ]);
    // Bought.quoteIn is what the buyer paid, tax included.
    for (const log of bought) {
      const t = taxOf[log.token.toLowerCase()];
      if (t?.buy) addLaunchpadRevenue(t.quote, Number(log.quoteIn) * t.buy / BPS, TRADE_TAX);
    }
    // Sold.quoteOut is what the seller received, after tax.
    for (const log of sold) {
      const t = taxOf[log.token.toLowerCase()];
      if (t?.sell) addLaunchpadRevenue(t.quote, Number(log.quoteOut) * t.sell / (BPS - t.sell), TRADE_TAX);
    }
  }

  // 3: V4 / Lock launchpads -- hook base fee + tax, reported to the splitter.
  const v4Launchpads = [...new Set(v4Launches.map((log: any) => log.launchpad.toLowerCase()))];
  if (v4Launchpads.length) {
    const splitters = [...new Set((await api.multiCall({
      abi: "address:revenueSplitter",
      calls: v4Launchpads,
      permitFailure: true,
    })).filter(Boolean).map((s: string) => s.toLowerCase()))];
    const v4Tokens = [...new Set(v4Launches.map((log: any) => log.token.toLowerCase()))];
    const configs = await api.multiCall({
      abi: "function configOf(address) view returns (address creator, address quoteAsset, int24 tickSpacing, address hooks, bool configured)",
      calls: splitters.flatMap((target) => v4Tokens.map((token) => ({ target, params: [token] }))),
      permitFailure: true,
    });
    const quoteOf: Record<string, string> = {};
    configs.forEach((c: any, i: number) => {
      const quote = c?.quoteAsset?.toLowerCase();
      if (c?.configured && quote && QUOTE_ASSETS.has(quote)) quoteOf[v4Tokens[i % v4Tokens.length]] = quote;
    });
    const taxLogs = await getLogs({ targets: splitters, eventAbi: TAX_NOTIFIED_EVENT });
    for (const log of taxLogs) {
      const quote = quoteOf[log.token.toLowerCase()];
      if (quote) addLaunchpadRevenue(quote, Number(log.amount), V4_HOOK_FEES);
    }
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.STABLE],
  fetch,
  start: "2026-07-01",
  methodology: {
    Fees: "1% swap fees on Pumper-launched tokens' Uniswap V3 pools and on the PUMPER pools, plus creator-set buy/sell taxes and the V4 hook / Lock-curve fees (1% base fee + tax) on Pumper-launched tokens. Launched tokens are taken from PumperProtocolRegistry.",
    Revenue: "20% of every launched token's fees and taxes: 10% to adminVault, 5% to the FEFER buy-and-burn vault, 5% to the PUMPER buy-and-burn vault. PUMPER's own pool fees carry no protocol cut.",
    ProtocolRevenue: "The 10% of launched token fees and taxes paid to adminVault, the protocol treasury.",
    SupplySideRevenue: "The remaining 80% of launched token fees and taxes, split between each token's creator, stakers, buyback-and-burn and liquidity in a ratio the creator fixes at launch; plus 100% of PUMPER pool fees, paid to its LPs.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "1% swap fees on Uniswap V3 pools of tokens launched through Pumper.",
      [TRADE_TAX]: "Creator-set buy/sell taxes on tokens from Pumper's V3 launchpads, taken on trades through the launchpad.",
      [V4_HOOK_FEES]: "Fees taken by the V4 / Lock launchpad hooks on every swap and by the Lock launchpad on curve trades: a 1% base fee plus the creator-set tax, reported together as one TaxNotified amount per collection.",
      [PUMPER_SWAP_FEES]: "1% swap fees on the PUMPER/USDT0 and PUMPER/WgUSDT pools.",
    },
    Revenue: {
      [TO_ADMIN_VAULT]: "10% of launched token fees and taxes, sent to adminVault.",
      [TO_FEFER_VAULT]: "5% of launched token fees and taxes, sent to the FEFER buy-and-burn vault.",
      [TO_PUMPER_VAULT]: "5% of launched token fees and taxes, sent to the PUMPER buy-and-burn vault.",
    },
    ProtocolRevenue: {
      [TO_ADMIN_VAULT]: "10% of launched token fees and taxes, sent to adminVault, the protocol treasury.",
    },
    SupplySideRevenue: {
      [TO_CREATORS_AND_STAKERS]: "80% of launched token fees and taxes, split between creator, stakers, buyback-and-burn and liquidity per the creator's fixed split.",
      [PUMPER_TO_LPS]: "100% of PUMPER pool fees, paid to its liquidity providers.",
    },
  },
  pullHourly: true,
  doublecounted: true, // the underlying pools are Uniswap V3/V4 on Stable
};

export default adapter;
