import { encodeBytes32String, id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Montra (https://montramarkets.xyz) is a token launchpad on Elysium. Every coin trades in its own
// Uniswap V4 pool whose hook is a Montra launch hook. The hook charges a fee in the pool's pair asset (native HYPE or KNTQ) on
// every swap and splits it between the coin's creator side and the protocol fee vault. Every address is read from the Montra
// registry (https://montramarkets.xyz/docs/contracts) at the window's end block.
const REGISTRY = "0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7";
const FACTORY_DEPLOY_BLOCK = 588508; // first Montra factory log, 2026-11-04
const NATIVE = "0x0000000000000000000000000000000000000000";

const REGISTRY_GET = "function get(bytes32 name) view returns (address)";
const REGISTRY_HOOKS = "function hooks() view returns (address[])";
// Protocol fee vault payout lanes. The fields used are recipient, asset (the asset the lane is paid in) and bps; the others are
// unverified. Through 2026-11-08: lane 0 = treasury Safe, 10000 bps. On 2026-11-10: treasury 3000 bps, MONTRA buyback-and-burn 7000 bps.
const VAULT_LANES = "function lanes() view returns (tuple(address recipient, address asset, uint256 arg2, uint256 bps, uint256 arg4)[])";
const BPS = 10_000n;

// quote is the pair asset (address(0) = native HYPE).
const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, address quote, bool arg5, uint256 supply, int24 tick, address arg8, bool arg9, uint256 arg10, uint256 arg11)";
// Emitted by the hook on every swap: fee is the hook fee in the pair asset, protocolFee the part of it owed to the protocol fee vault
// (the rest stays with the coin's creator side). arg1 and arg2 are the swap direction and amountSpecified.
const FEE_ACCRUED = "event FeeAccrued(bytes32 indexed poolId, bool arg1, int256 arg2, uint256 fee, uint256 protocolFee)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const LABEL = {
  swapFees: "Swap Fees",
  toCreators: "Swap Fees To Creators",
  toTreasury: "Swap Fees To Treasury",
  toBuyback: "Swap Fees To MONTRA Buyback And Burn",
};

const lower = (a: string) => String(a).toLowerCase();
// getLogs can return the same log twice when it splits a busy block range (seen on Elysium: 11 duplicate Swap logs in the hour
// 2026-11-09 14:00 UTC), which would double count fees and volume.
const dedupe = (logs: any[]) => {
  const seen = new Set<string>();
  return logs.filter((log) => {
    const key = `${lower(log.transactionHash)}-${Number(log.logIndex)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const abs = (v: bigint) => (v < 0n ? -v : v);

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const addQuote = (balances: any, quote: string, amount: bigint, label?: string) =>
    quote === NATIVE ? balances.addGasToken(amount, label) : balances.add(quote, amount, label);

  // ---- addresses from the registry ----
  const names = ["factory", "poolManager", "protocolVault", "montra", "routeFiller", "buybackFiller"];
  const [factory, poolManager, protocolVault, montra, routeFiller, buybackFiller] = (await options.api.multiCall({
    abi: REGISTRY_GET, target: REGISTRY, calls: names.map((n) => encodeBytes32String(n)),
  })).map(lower);
  const hooks: string[] = await options.api.call({ abi: REGISTRY_HOOKS, target: REGISTRY });
  // Swaps the protocol makes itself (fee-market conversions, MONTRA buybacks) are neither volume nor fees.
  const protocolSwappers = new Set([routeFiller, buybackFiller]);

  // ---- protocol fee vault lanes: the protocol share's split between treasury and MONTRA buyback ----
  const lanes = await options.api.call({ abi: VAULT_LANES, target: protocolVault });
  let treasuryBps = 0n, buybackBps = 0n;
  // Until the MONTRA lane was added (between 2026-11-08 and 2026-11-10) the treasury lane had 100% and montra was not registered.
  for (const lane of lanes) {
    if (BigInt(lane.bps) === 0n) continue; // empty lane slot
    if (montra !== NATIVE && lower(lane.asset) === montra) buybackBps += BigInt(lane.bps);
    else if (lower(lane.asset) === NATIVE) treasuryBps += BigInt(lane.bps);
    else throw new Error(`Montra: unknown fee vault lane ${lane.recipient} paid in ${lane.asset}; review the revenue split`);
  }
  if (treasuryBps + buybackBps !== BPS) throw new Error("Montra: fee vault lanes do not sum to 100%");

  // ---- every launch: poolId -> launched coin and pair asset (full history, cached) ----
  const launches = await options.getLogs({ target: factory, eventAbi: TOKEN_LAUNCHED, fromBlock: FACTORY_DEPLOY_BLOCK, cacheInCloud: true });
  const poolInfo: Record<string, { token: string, quote: string }> = {};
  for (const l of launches) poolInfo[lower(l.poolId)] = { token: lower(l.token), quote: lower(l.quote) };

  const feeLogs = dedupe(await options.getLogs({ targets: hooks, eventAbi: FEE_ACCRUED, onlyArgs: false }));
  const activePools = [...new Set(feeLogs.map((log: any) => lower(log.args.poolId)))];
  for (const p of activePools) if (!poolInfo[p]) throw new Error(`Montra: pool ${p} has no TokenLaunched log`);

  const swapLogs: any[] = [];
  for (let i = 0; i < activePools.length; i += 200) {
    const chunk = activePools.slice(i, i + 200);
    swapLogs.push(...await options.getLogs({ target: poolManager, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, chunk] as any, onlyArgs: false }));
  }
  const swaps = dedupe(swapLogs);
  const txPool = (log: any, pool: string) => `${lower(log.transactionHash)}-${pool}`;
  const protocolSwapKeys = new Set(swaps.filter((s) => protocolSwappers.has(lower(s.args.sender))).map((s) => txPool(s, lower(s.args.id))));

  // ---- fees: accrued on every swap ----
  const feesByKey: Record<string, any[]> = {};
  for (const log of feeLogs) {
    const pool = lower(log.args.poolId);
    if (protocolSwapKeys.has(txPool(log, pool))) continue;
    (feesByKey[txPool(log, pool)] ??= []).push(log);
    const { quote } = poolInfo[pool];
    const fee = BigInt(log.args.fee);
    const toProtocol = BigInt(log.args.protocolFee);
    const toBuyback = toProtocol * buybackBps / BPS;
    addQuote(dailyFees, quote, fee, LABEL.swapFees);
    addQuote(dailySupplySideRevenue, quote, fee - toProtocol, LABEL.toCreators);
    addQuote(dailyRevenue, quote, toProtocol - toBuyback, LABEL.toTreasury);
    addQuote(dailyProtocolRevenue, quote, toProtocol - toBuyback, LABEL.toTreasury);
    addQuote(dailyRevenue, quote, toBuyback, LABEL.toBuyback);
    addQuote(dailyHoldersRevenue, quote, toBuyback, LABEL.toBuyback);
  }

  // ---- volume: launch-pool swaps, in the pair asset, gross of the hook fee ----
  // On a buy the hook charges its fee on top of the quote the pool receives (before the swap on exact-input buys, after it on
  // exact-output buys, e.g. 0xf3f885152e026383411698a541a8eaade19496a571f4a17310751f4f756d6652), so the Swap amount is net of it
  // and the fee is added back. On a sell the fee comes out of the output after the swap, so the Swap is gross.
  // Each Swap pairs with one FeeAccrued of the same tx and pool, in log order.
  const swapsByKey: Record<string, any[]> = {};
  for (const swap of swaps) (swapsByKey[txPool(swap, lower(swap.args.id))] ??= []).push(swap);
  const byLogIndex = (a: any, b: any) => Number(a.logIndex) - Number(b.logIndex);
  for (const [key, group] of Object.entries(swapsByKey)) {
    if (protocolSwapKeys.has(key)) continue;
    if (group.length !== (feesByKey[key] ?? []).length) throw new Error(`Montra: Swap/FeeAccrued count mismatch for ${key}`);
    group.sort(byLogIndex);
    feesByKey[key].sort(byLogIndex);
  }

  for (const swap of swaps) {
    const pool = lower(swap.args.id);
    if (protocolSwappers.has(lower(swap.args.sender))) continue;
    const { token, quote } = poolInfo[pool];
    const quoteIs0 = quote < token; // Uniswap V4 sorts currency0 < currency1 (native HYPE is always currency0)
    const amount = BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1);
    addQuote(dailyVolume, quote, abs(amount));
    if (amount >= 0n) continue; // sell: pool paid the quote out, already gross
    const key = txPool(swap, pool);
    const feeLog = feesByKey[key][swapsByKey[key].indexOf(swap)];
    addQuote(dailyVolume, quote, BigInt(feeLog.args.fee));
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
}

const methodology = {
  Volume: "Value of all trades in Montra launch pools, measured in the pool's pair asset (HYPE or KNTQ) before the trading fee. Montra's own fee conversions and MONTRA buybacks are excluded.",
  Fees: "Trading fees charged by the Montra launch hook on every launch-pool trade. Montra charges no launch fee.",
  UserFees: "Trading fees paid by traders on every Montra launch-pool trade.",
  Revenue: "The protocol's part of every trading fee, sent to the Montra protocol fee vault, which pays it to the treasury and to MONTRA buybacks.",
  SupplySideRevenue: "The part of every trading fee kept for each coin's creator side.",
  ProtocolRevenue: "The share of the protocol fee vault paid to the Montra treasury.",
  HoldersRevenue: "The share of the protocol fee vault used to buy back and burn MONTRA.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "Hook fee charged in the pair asset on every launch-pool trade, from the hook's FeeAccrued events.",
  },
  UserFees: {
    [LABEL.swapFees]: "Hook fee paid by traders on every launch-pool trade.",
  },
  Revenue: {
    [LABEL.toTreasury]: "Treasury lane of the protocol fee vault's share of trading fees (30% of the vault on 2026-11-10).",
    [LABEL.toBuyback]: "MONTRA buyback lane of the protocol fee vault's share of trading fees (70% of the vault on 2026-11-10); the MONTRA bought is burned.",
  },
  ProtocolRevenue: {
    [LABEL.toTreasury]: "Treasury lane of the protocol fee vault's share of trading fees (30% of the vault on 2026-11-10).",
  },
  HoldersRevenue: {
    [LABEL.toBuyback]: "MONTRA buyback lane of the protocol fee vault's share of trading fees (70% of the vault on 2026-11-10); the MONTRA bought is burned.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "Part of every trading fee kept by the hook for the coin's creator side (the creator or its fee splitter recipients).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-04",
  methodology,
  breakdownMethodology,
};

export default adapter;
