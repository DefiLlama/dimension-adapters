import { encodeBytes32String, id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Montra (https://montramarkets.xyz) is a token launchpad on Elysium. Every coin trades in its own
// Uniswap V4 pool whose hook is a Montra launch hook. The hook charges a fee in the pool's pair asset (native HYPE or KNTQ) on
// every swap and splits it between the coin's creator side and the protocol fee vault. Every address is read from the Montra
// registry (https://montramarkets.xyz/docs/contracts) at the window's end block. Event and vault ABIs are Montra's published ones
// (https://montramarkets.xyz/docs/events, /docs/abis/events.json, /docs/abis/ProtocolFeeVault.json).
const REGISTRY = "0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7";
const FACTORY_DEPLOY_BLOCK = 588508; // first Montra factory log, 2026-11-04
const NATIVE = "0x0000000000000000000000000000000000000000";

const REGISTRY_GET = "function get(bytes32 name) view returns (address)";
const REGISTRY_HOOKS = "function hooks() view returns (address[])";
// Protocol fee vault payout lanes: `want` is the asset a lane is paid in (address(0) = paid as received, no conversion).
// Through 2026-11-09: lane 0 = treasury Safe, 10000 bps. On 2026-11-10: treasury 3000 bps, MONTRA buyback-and-burn 7000 bps.
const VAULT_LANES = "function lanes() view returns (tuple(address to, address want, bool converts, uint16 shareBps, uint16 floorBps)[])";
const BPS = 10_000n;

// quote is the pair asset (address(0) = native HYPE). A launch's first buy (its Swap and FeeAccrued) is logged before TokenLaunched.
const TOKEN_LAUNCHED = "event TokenLaunched(address indexed token, address indexed creator, bytes32 indexed poolId, uint256 configId, address quote, bool quoteIsCurrency0, uint256 supply, int24 startTick, address feeRecipient, bool feeLocked, uint256 firstBuyIn, uint256 firstBuyOut)";
// Once per swap, even when the fee rounds to zero: fee is the hook fee in the quote (anti-snipe premium included), protocolPart the
// protocol's part of it; the rest is the creator side's.
const FEE_ACCRUED = "event FeeAccrued(bytes32 indexed poolId, bool zeroForOne, int256 amountSpecified, uint256 fee, uint256 protocolPart)";
// LP fees earned by a graduated pool's seed position: the quote goes to the creator, the launched tokens are burned.
const SEED_FEES_HARVESTED = "event SeedFeesHarvested(bytes32 indexed poolId, address indexed caller, uint256 quoteToCreator, uint256 tokensBurned)";
// Native launch fee, collected by the factory into the protocol fee vault (the launch fee is 0 since 2026-11-04).
const LAUNCH_FEES_COLLECTED = "event LaunchFeesCollected(address indexed recipient, uint256 amount)";
const V4_SWAP = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC0 = id("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");

const LABEL = {
  swapFees: "Swap Fees",
  seedLpFees: "Seed LP Fees",
  launchFees: "Launch Fees",
  toCreators: "Swap Fees To Creators",
  seedLpToCreators: "Seed LP Fees To Creators",
  toTreasury: "Swap Fees To Treasury",
  toBuyback: "Swap Fees To MONTRA Buyback And Burn",
  launchToTreasury: "Launch Fees To Treasury",
  launchToBuyback: "Launch Fees To MONTRA Buyback And Burn",
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
  // Until the MONTRA lane was added (2026-11-10) the treasury lane had 100% and montra was not registered.
  for (const lane of lanes) {
    if (BigInt(lane.shareBps) === 0n) continue; // empty lane slot
    if (montra !== NATIVE && lower(lane.want) === montra) buybackBps += BigInt(lane.shareBps);
    else if (lower(lane.want) === NATIVE) treasuryBps += BigInt(lane.shareBps);
    else throw new Error(`Montra: unknown fee vault lane to ${lane.to} paid in ${lane.want}; review the revenue split`);
  }
  if (treasuryBps + buybackBps !== BPS) throw new Error("Montra: fee vault lanes do not sum to 100%");
  // Splits an amount the vault receives into its treasury and MONTRA buyback lanes.
  const addToVault = (quote: string, amount: bigint, treasuryLabel: string, buybackLabel: string) => {
    const toBuyback = amount * buybackBps / BPS;
    addQuote(dailyRevenue, quote, amount - toBuyback, treasuryLabel);
    addQuote(dailyProtocolRevenue, quote, amount - toBuyback, treasuryLabel);
    addQuote(dailyRevenue, quote, toBuyback, buybackLabel);
    addQuote(dailyHoldersRevenue, quote, toBuyback, buybackLabel);
  };

  // ---- every launch: poolId -> pair asset and its side (full history, cached) ----
  const launches = await options.getLogs({ target: factory, eventAbi: TOKEN_LAUNCHED, fromBlock: FACTORY_DEPLOY_BLOCK, cacheInCloud: true });
  const poolInfo: Record<string, { quote: string, quoteIs0: boolean }> = {};
  for (const l of launches) poolInfo[lower(l.poolId)] = { quote: lower(l.quote), quoteIs0: Boolean(l.quoteIsCurrency0) };

  // ---- launch fees: native, collected into the protocol fee vault ----
  const launchFees = await options.getLogs({ target: factory, eventAbi: LAUNCH_FEES_COLLECTED });
  for (const l of launchFees) {
    if (lower(l.recipient) !== protocolVault) throw new Error(`Montra: launch fees collected to ${l.recipient}, not the protocol fee vault`);
    addQuote(dailyFees, NATIVE, BigInt(l.amount), LABEL.launchFees);
    addToVault(NATIVE, BigInt(l.amount), LABEL.launchToTreasury, LABEL.launchToBuyback);
  }

  // ---- seed LP fees of graduated pools: quote side to the creator (the launched tokens harvested are burned, not counted) ----
  const harvests = await options.getLogs({ targets: hooks, eventAbi: SEED_FEES_HARVESTED });
  for (const h of harvests) {
    const info = poolInfo[lower(h.poolId)];
    if (!info) throw new Error(`Montra: pool ${h.poolId} has no TokenLaunched log`);
    addQuote(dailyFees, info.quote, BigInt(h.quoteToCreator), LABEL.seedLpFees);
    addQuote(dailySupplySideRevenue, info.quote, BigInt(h.quoteToCreator), LABEL.seedLpToCreators);
  }

  const feeLogs = dedupe(await options.getLogs({ targets: hooks, eventAbi: FEE_ACCRUED, onlyArgs: false }));
  const activePools = [...new Set(feeLogs.map((log: any) => lower(log.args.poolId)))];
  for (const p of activePools) if (!poolInfo[p]) throw new Error(`Montra: pool ${p} has no TokenLaunched log`);

  const swapLogs: any[] = [];
  for (let i = 0; i < activePools.length; i += 200) {
    const chunk = activePools.slice(i, i + 200);
    swapLogs.push(...await options.getLogs({ target: poolManager, eventAbi: V4_SWAP, topics: [V4_SWAP_TOPIC0, chunk] as any, onlyArgs: false }));
  }
  const swaps = dedupe(swapLogs);
  // Swaps and their FeeAccrued pair one-to-one by transaction, pool and direction, in log order (Montra events docs). A Swap's
  // direction: zeroForOne pays currency0 into the pool, so its amount0 is negative.
  const swapKey = (s: any) => `${lower(s.transactionHash)}-${lower(s.args.id)}-${BigInt(s.args.amount0) < 0n}`;
  const feeKey = (f: any) => `${lower(f.transactionHash)}-${lower(f.args.poolId)}-${Boolean(f.args.zeroForOne)}`;
  const txPool = (log: any, pool: string) => `${lower(log.transactionHash)}-${pool}`;
  const protocolSwapKeys = new Set(swaps.filter((s) => protocolSwappers.has(lower(s.args.sender))).map((s) => txPool(s, lower(s.args.id))));

  // ---- fees: accrued on every swap ----
  const feesByKey: Record<string, any[]> = {};
  for (const log of feeLogs) {
    const pool = lower(log.args.poolId);
    if (protocolSwapKeys.has(txPool(log, pool))) continue;
    (feesByKey[feeKey(log)] ??= []).push(log);
    const { quote } = poolInfo[pool];
    const fee = BigInt(log.args.fee);
    const toProtocol = BigInt(log.args.protocolPart);
    addQuote(dailyFees, quote, fee, LABEL.swapFees);
    addQuote(dailySupplySideRevenue, quote, fee - toProtocol, LABEL.toCreators);
    addToVault(quote, toProtocol, LABEL.toTreasury, LABEL.toBuyback);
  }

  // ---- volume: launch-pool swaps, in the pair asset, gross of the hook fee ----
  // A v4 Swap shows the pool's side of a trade. On a buy the pool receives the input less the hook fee, so the fee is added back;
  // on a sell the pool pays out the whole and the hook takes its fee from that, so the Swap amount is already gross.
  const swapsByKey: Record<string, any[]> = {};
  for (const swap of swaps) {
    if (protocolSwapKeys.has(txPool(swap, lower(swap.args.id)))) continue;
    (swapsByKey[swapKey(swap)] ??= []).push(swap);
  }
  const byLogIndex = (a: any, b: any) => Number(a.logIndex) - Number(b.logIndex);
  for (const [key, group] of Object.entries(swapsByKey)) {
    if (group.length !== (feesByKey[key] ?? []).length) throw new Error(`Montra: Swap/FeeAccrued count mismatch for ${key}`);
    group.sort(byLogIndex);
    feesByKey[key].sort(byLogIndex);
  }

  for (const [key, group] of Object.entries(swapsByKey)) {
    group.forEach((swap, i) => {
      const { quote, quoteIs0 } = poolInfo[lower(swap.args.id)];
      const amount = BigInt(quoteIs0 ? swap.args.amount0 : swap.args.amount1);
      addQuote(dailyVolume, quote, abs(amount));
      if (amount < 0n) addQuote(dailyVolume, quote, BigInt(feesByKey[key][i].args.fee)); // buy: add the hook fee back
    });
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
}

const methodology = {
  Volume: "Value of all trades in Montra launch pools, measured in the pool's pair asset (HYPE or KNTQ) before the trading fee. Montra's own fee conversions and MONTRA buybacks are excluded.",
  Fees: "Trading fees charged by the Montra launch hook on every launch-pool trade (including the higher anti-snipe fee right after launch), LP fees earned by graduated pools' seed liquidity, and launch fees (none charged so far).",
  UserFees: "Trading fees, seed LP fees and launch fees paid by Montra traders and token launchers.",
  Revenue: "The protocol's part of every trading fee, plus any launch fees, sent to the Montra protocol fee vault, which pays them to the treasury and to MONTRA buybacks.",
  SupplySideRevenue: "The part of every trading fee kept for each coin's creator side, plus the seed LP fees paid to creators.",
  ProtocolRevenue: "The share of the protocol fee vault paid to the Montra treasury: all of it until 2026-11-10, 30% since.",
  HoldersRevenue: "The share of the protocol fee vault used to buy back and burn MONTRA: 70% since 2026-11-10, none before.",
};

const treasuryLane = "Treasury lane of the protocol fee vault (100% of the vault until 2026-11-10, 30% since)";
const buybackLane = "MONTRA buyback lane of the protocol fee vault (70% of the vault since 2026-11-10); the MONTRA bought is burned";
const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "Hook fee charged in the pair asset on every launch-pool trade, anti-snipe premium included, from the hook's FeeAccrued events.",
    [LABEL.seedLpFees]: "Pair-asset LP fees earned by a graduated pool's seed liquidity, from the hook's SeedFeesHarvested events.",
    [LABEL.launchFees]: "Native launch fee paid per launch, from the factory's LaunchFeesCollected events (0 since launch).",
  },
  UserFees: {
    [LABEL.swapFees]: "Hook fee paid by traders on every launch-pool trade.",
    [LABEL.seedLpFees]: "LP fees paid by traders to graduated pools' seed liquidity.",
    [LABEL.launchFees]: "Native launch fee paid by token launchers.",
  },
  Revenue: {
    [LABEL.toTreasury]: `${treasuryLane}, from the protocol's part of trading fees.`,
    [LABEL.toBuyback]: `${buybackLane}, from the protocol's part of trading fees.`,
    [LABEL.launchToTreasury]: `${treasuryLane}, from launch fees.`,
    [LABEL.launchToBuyback]: `${buybackLane}, from launch fees.`,
  },
  ProtocolRevenue: {
    [LABEL.toTreasury]: `${treasuryLane}, from the protocol's part of trading fees.`,
    [LABEL.launchToTreasury]: `${treasuryLane}, from launch fees.`,
  },
  HoldersRevenue: {
    [LABEL.toBuyback]: `${buybackLane}, from the protocol's part of trading fees.`,
    [LABEL.launchToBuyback]: `${buybackLane}, from launch fees.`,
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "Part of every trading fee kept by the hook for the coin's creator side (the creator, its fee splitter recipients, or the token's holder rewards), anti-snipe premium included.",
    [LABEL.seedLpToCreators]: "Pair-asset seed LP fees of graduated pools, paid to the coin's creator side.",
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
