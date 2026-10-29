import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";
import { isCoreAsset } from "../helpers/prices";

// Fables: a dynamic-fee ve(3,3) DEX built on Uniswap v4 on Robinhood Chain.
//
// Pools are enumerated from the on-chain FablesPoolRegistry (activePools), so registering or
// retiring a pool there starts or stops tracking here; no pool is hardcoded. Volume and swap fees
// come from one PoolManager Swap getLogs call, with topic1 OR'd across every registered pool id.
// Uniswap's PositionManager also holds plain v4 positions in most Fables pools (51 of 69 on 2026-10-23),
// so dexs/uniswap-v4.ts resolves those pool keys and counts the same swaps: hence doublecounted.
//
// Every swap fee is an LP fee. LPs who deposit through a Fables hook hold ledger shares in a range; the
// hook owns one v4 position per range and splits its fees each time they are collected (any deposit,
// withdrawal, claim, stake, unstake or sync of that range), emitting FeesCollected:
//   - fees earned by STAKED shares (stakedCut) are owed to the EpochDistributor and paid to the
//     veFABLES voters of that pool's gauge,
//   - fees earned by UNSTAKED shares stay with the LP, minus the claim fee (10% on every pool), which
//     is owed to the hook's claimFeeRecipient. The current hooks log each cut as ClaimFeeAccrued; the
//     legacy hooks (LEGACY_HOOKS, one pool each) do not, so their cut is read as the change of the
//     hook's claimFeeOwed pot plus what ClaimFeeSwept paid out of it in the window.
// Staked fees are booked when they ACCRUE, as the weekly settlement attributes them to voters: the
// staked cuts collected in the window, plus the staked share of the range's uncollected v4 fees at the
// window's last block, minus the same at its first block (uncollected fees = v4's feeGrowthInside delta
// on the hook's position x its liquidity; every stake or deposit change syncs the range first, so the
// staked share is constant over any uncollected stretch). A range staked in a pool with no swap,
// donation or collection in the window accrues nothing and is not read. The claim fee is booked when
// the ledger skims it: its rate (the lowest since the range's last collection) and its recipient are
// only fixed then, and the settlement credits it the same way.
// Supply-side revenue is the rest of the window's swap fees: fees kept by unstaked ledger LPs and by LPs
// holding plain Uniswap v4 positions in these pools.
//
// Where the revenue goes depends on the claim-fee recipient and on the pool's gauge, as the protocol
// settles each epoch (gauge state and votes are read at the window end):
//   - recipient = claim-fee forwarder and a live gauge with votes: staked cut and claim fee go to
//     that gauge's veFABLES voters (holders revenue),
//   - recipient = any other address (a treasury Safe): the claim fee is protocol revenue,
//   - no gauge, a retired gauge, or a gauge nobody voted for: the claim fee goes to the treasury and
//     the staked cut is refunded to its stakers (supply side),
//   - an emergency-killed gauge: its staked cut and claim fee go to the treasury.
// Bribes are external income for veFABLES voters, so they are holders revenue only (not fees). They
// are booked when FablesBribes forwards them to the epoch distributor (Forwarded); a bribe that is
// never forwarded is reclaimed by the briber and never counted. Bribes the team pays from its own Safes
// (TEAM_BRIBERS) are excluded pro rata. A bribe fee (BribeFeeTaken, 0% so far) is a fee charged to
// bribers and goes to the treasury.
// Vote-churn penalties (applied off-chain as smaller voter leaves) are not measured.
//
// The fee split starts with the ve(3,3) launch (BREAKDOWN_START, 2026-10-20 16:00 UTC, once every hook's
// claim fee was routed to the voters' forwarder). Earlier windows keep this adapter's previous method
// (every swap fee as an LP fee, no revenue): a 10% claim fee on unstaked ledger liquidity then went to
// the treasury and is not broken out here.

const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951"; // Uniswap v4 PoolManager on Robinhood
const REGISTRY = "0x159a113e012593d9b3cc63ad45e30f0467e13ef3"; // FablesPoolRegistry
const STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b"; // Uniswap v4 StateView on Robinhood
const VOTER = "0x71570b34d9200ffe5c3066f5a204f91229e7338e"; // FablesVoter: gauges and votes
const BRIBES = "0x325532108660c1445e723d6205ce89462ef61836"; // FablesBribes
// FablesFeeForwarder in the claim-fee role: forwards claim fees to the EpochDistributor
// (0x498506256215702f0da01c0f9ab0c765488acd07), which pays the voters.
const CLAIM_FEE_FORWARDER = "0x71ec190f76762f824407aeb2d244dc120c48262d";
const FABLES = "0xb63d07cef74be747231d601bb2faa6b252c68106"; // FABLES, priced through its CoinGecko id
// FablesVoter was deployed on 2026-10-19 21:15 UTC in this block: no gauge, stake or bribe exists before it.
const VOTER_BLOCK = 92925399;
// First window with the fee split (see the header); earlier windows keep the previous method.
const BREAKDOWN_START = Date.parse("2026-10-20T16:00:00Z") / 1000;
// Fables team Safes: bribes they pay are the team's own money, not income for voters.
const TEAM_BRIBERS = new Set([
  "0x385bc909ca7efd34788216ea97346d3ba75c94de", // Seeder Safe (launch liquidity; 100k FABLES bribe for epoch 2963, tx 0x49ed2466...)
  "0x215f159881964f1e924dbfe40e9e64181b0d4b73", // Team Safe (holds the team's veFABLES lock)
  "0x9f887b9930e9e716286333bd8e291f64a8710f6f", // Treasury Safe (protocol revenue)
  "0xb6bf951dfa853f365e7b9979701dd95f969d5b0d", // Admin Safe
]);
// Hooks on the legacy ledger ABI: one registry pool each, hook-wide claimFeeBps() and no ClaimFeeAccrued
// event. The set is closed: no new hook is deployed on this ABI.
const LEGACY_HOOKS = new Set([
  "0x06a889870c8f83640d6816319f72e2aa579b6080",
  "0xb608a78761f179f7c56f15e7d13921b92f00a080",
  "0xa0e8fbff13e24af2b5e61a72800e08a161bde080",
  "0x66622f77b797d506e5376f7798b67ab288966080",
  "0x70a9a88402989226847ec122043ce5e7ff462080",
  "0x67d86050d22d574df046f3d90f722045f714e080",
  "0x79576fbad6e83915630bbb5d5658483f05532080",
  "0x8af95932ec4484fb10c641a4cbcf19a798cb2080",
  "0xa4570c37590e45f0b06898123d4de16307a32080",
]);
// FablesVoter.GaugeState { LIVE, RETIRED, EMERGENCY }; GaugeClass NONE = 0 means the pool has no gauge
const GAUGE_LIVE = 0;
const GAUGE_EMERGENCY = 2;

const Q128 = 1n << 128n;
const Q256 = 1n << 256n;

const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"; // v4 Swap topic0
const DONATE_TOPIC = "0x29ef05caaff9404b7cb6d1c0e9bbae9eaa7ab2541feba1a9c4248594c08156cb"; // v4 Donate topic0
const SwapEvent =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const DonateEvent = "event Donate(bytes32 indexed id, address indexed sender, uint256 amount0, uint256 amount1)";
const FeesCollectedEvent =
  "event FeesCollected(uint256 indexed rangeId, uint256 fee0, uint256 fee1, uint256 stakedCut0, uint256 stakedCut1, uint256 accStaked0X128, uint256 accStaked1X128, uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128, uint128 totalShares, uint128 totalStaked, uint64 collectionSeq, uint64 resetSeq)";
const ClaimFeeAccruedEvent =
  "event ClaimFeeAccrued(uint256 indexed rangeId, bytes32 indexed poolId, uint256 cut0, uint256 cut1, uint16 feeBps)";
const ClaimFeeSweptEvent = "event ClaimFeeSwept(address indexed currency, address indexed recipient, uint256 amount)";
const StakedEvent = "event Staked(address indexed owner, uint256 indexed rangeId, uint128 shares)";
const UnstakedEvent = "event Unstaked(address indexed owner, uint256 indexed rangeId, uint128 shares)";
const BribedEvent = "event Bribed(uint256 indexed epoch, bytes32 indexed poolId, address indexed token, address from, uint256 amount)";
const ForwardedEvent = "event Forwarded(uint256 indexed epoch, bytes32 indexed poolId, address indexed token, uint256 amount)";
const BribeFeeTakenEvent = "event BribeFeeTaken(uint256 indexed epoch, bytes32 indexed poolId, address indexed token, address to, uint256 cut)";

const abis = {
  activePools:
    "function activePools() view returns (tuple(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bytes32 id, bool active)[])",
  rangeKey:
    "function rangeKey(uint256 id) view returns (tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, int24 tickLower, int24 tickUpper, bool set)",
  rangeState:
    "function rangeState(uint256 id) view returns (tuple(uint128 totalShares, uint128 totalStaked, uint256 accFee0X128, uint256 accFee1X128, uint256 accStaked0X128, uint256 accStaked1X128, uint128 stakedResidual0, uint128 stakedResidual1, uint64 collectionSeq, uint64 resetSeq))",
  rangeGrowth: "function rangeGrowth(uint256 id) view returns (uint256 growth0, uint256 growth1)",
  getPositionInfo:
    "function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
  claimFeeRecipient: "address:claimFeeRecipient",
  claimFeeOwed: "function claimFeeOwed(address currency) view returns (uint256)",
  getSlot0: "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  currentEpoch: "uint256:currentEpoch",
  gaugeClass: "function gaugeClass(bytes32 poolId) view returns (uint8)",
  gaugeStateAt: "function gaugeStateAt(bytes32 poolId, uint256 epoch) view returns (uint8)",
  gaugeWeightNow: "function gaugeWeightNow(bytes32 poolId) view returns (uint256)",
  votesFor: "function votesFor(uint256 epoch, bytes32 poolId) view returns (uint256)",
};

const LABELS = {
  STAKED_TO_VOTERS: "Staked LP Fees To Voters",
  CLAIM_TO_VOTERS: "Claim Fees To Voters",
  CLAIM_TO_TREASURY: "Claim Fees To Treasury",
  KILLED_TO_TREASURY: "Killed Gauge Fees To Treasury",
  BRIBES_TO_VOTERS: "Bribes To Voters",
  BRIBE_FEES: "Bribe Fees",
  BRIBE_FEES_TO_TREASURY: "Bribe Fees To Treasury",
};

type Pool = {
  id: string;
  hook: string;
  currency0: string;
  currency1: string;
  useToken0: boolean; // valued on the native / core-asset leg
  swapFees: number; // amounts below are in units of the valued leg
  staked: number;
  claim: number;
};

type Range = {
  hook: string;
  id: string;
  pool?: Pool;
  tickLower?: number;
  tickUpper?: number;
  stakedFrom: bigint; // staked shares at the window's first block
  stakedTo: bigint; // and at its last
  cut0: bigint; // staked fees accrued in the window, per currency
  cut1: bigint;
  collected: boolean;
};

const keyOf = (k: any) =>
  [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks].map((v: any) => String(v).toLowerCase()).join("-");

// The staked share of a range's uncollected v4 fees, per currency: what the ledger's next collection
// will set aside for the voters (LedgerLib: cut = fees x totalStaked / totalShares).
const pendingStakedCut = (state: any, growth: any, position: any): [bigint, bigint] => {
  const total = BigInt(state.totalShares);
  const staked = BigInt(state.totalStaked);
  if (total === 0n || staked === 0n) return [0n, 0n];
  const liquidity = BigInt(position.liquidity);
  // v4 fee growth is modular; only the wrapped delta since the position's last update carries information
  const owed = (now: any, last: any) => (((((BigInt(now) - BigInt(last)) % Q256) + Q256) % Q256) * liquidity) / Q128;
  return [
    (owed(growth.growth0, position.feeGrowthInside0LastX128) * staked) / total,
    (owed(growth.growth1, position.feeGrowthInside1LastX128) * staked) / total,
  ];
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { api, fromApi, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const registryPools = await api.call({ target: REGISTRY, abi: abis.activePools });
  const pools = new Map<string, Pool>();
  const poolByKey = new Map<string, Pool>();
  for (const p of registryPools) {
    const currency0 = String(p.key.currency0).toLowerCase();
    const currency1 = String(p.key.currency1).toLowerCase();
    // Price on the native / core-asset leg where possible so a thin-liquidity token can't set value.
    const useToken0 =
      currency0 === ADDRESSES.null || isCoreAsset(options.chain, currency0) || !isCoreAsset(options.chain, currency1);
    const pool: Pool = { id: String(p.id).toLowerCase(), hook: String(p.key.hooks).toLowerCase(), currency0, currency1, useToken0, swapFees: 0, staked: 0, claim: 0 };
    pools.set(pool.id, pool);
    poolByKey.set(keyOf(p.key), pool);
  }
  if (!pools.size) throw new Error("FablesPoolRegistry returned no active pools");

  const swapsOf = () => getLogs({ target: POOL_MANAGER, eventAbi: SwapEvent, topics: [SWAP_TOPIC, [...pools.keys()]] as any });
  const addSwaps = (swapLogs: any[]) => {
    for (const log of swapLogs) {
      const pool = pools.get(String(log.id).toLowerCase());
      if (!pool) continue;
      const amount = Math.abs(Number(pool.useToken0 ? log.amount0 : log.amount1));
      const token = pool.useToken0 ? pool.currency0 : pool.currency1;
      dailyVolume.add(token, amount);
      const fee = (amount * Number(log.fee)) / 1e6; // dynamic fee carried in each Swap event
      pool.swapFees += fee;
      dailyFees.add(token, fee, METRIC.SWAP_FEES);
      dailyUserFees.add(token, fee, METRIC.SWAP_FEES);
    }
  };
  if (options.startTimestamp < BREAKDOWN_START) {
    // before the ve(3,3) launch the split is not broken out: every swap fee is reported as an LP fee (see the header)
    addSwaps(await swapsOf());
    for (const pool of pools.values()) {
      if (pool.swapFees) dailySupplySideRevenue.add(pool.useToken0 ? pool.currency0 : pool.currency1, pool.swapFees, METRIC.LP_FEES);
    }
    return { dailyVolume, dailyFees, dailyUserFees, dailySupplySideRevenue, dailyRevenue: 0, dailyHoldersRevenue: 0, dailyProtocolRevenue: 0 };
  }

  const fromBlock = Number(await options.getFromBlock());
  const toBlock = Number(await options.getToBlock());
  // Ledger events count in (fromBlock, toBlock]: the state read at fromBlock already includes that block.
  const inWindow = (log: any) => Number(log.blockNumber) > fromBlock;
  const hooks = [...new Set([...pools.values()].map((p) => p.hook))];
  const currentHooks = hooks.filter((h) => !LEGACY_HOOKS.has(h));
  // one pot per legacy hook, attributed to its (single) registry pool
  const legacyPools = [...new Map([...pools.values()].filter((p) => LEGACY_HOOKS.has(p.hook)).map((p) => [p.hook, p])).values()];

  const [swapLogs, donateLogs, collectedLogs, accruedLogs, sweptLogs, stakedLogs, unstakedLogs, recipients] = await Promise.all([
    swapsOf(),
    getLogs({ target: POOL_MANAGER, eventAbi: DonateEvent, topics: [DONATE_TOPIC, [...pools.keys()]] as any }),
    getLogs({ targets: hooks, eventAbi: FeesCollectedEvent, onlyArgs: false, flatten: false }),
    currentHooks.length ? getLogs({ targets: currentHooks, eventAbi: ClaimFeeAccruedEvent, onlyArgs: false }) : [],
    legacyPools.length ? getLogs({ targets: legacyPools.map((p) => p.hook), eventAbi: ClaimFeeSweptEvent, onlyArgs: false, flatten: false }) : [],
    // Which ranges hold staked shares: every Staked/Unstaked since the Voter deployment. A registry-like
    // scan that only grows at the head, so it is cached; the window's fees come from the reads below.
    getLogs({ targets: hooks, eventAbi: StakedEvent, fromBlock: VOTER_BLOCK, toBlock, onlyArgs: false, flatten: false, cacheInCloud: true }),
    getLogs({ targets: hooks, eventAbi: UnstakedEvent, fromBlock: VOTER_BLOCK, toBlock, onlyArgs: false, flatten: false, cacheInCloud: true }),
    api.multiCall({ abi: abis.claimFeeRecipient, calls: hooks }),
  ]);
  const recipientOf = new Map(hooks.map((h, i) => [h, String(recipients[i]).toLowerCase()]));

  addSwaps(swapLogs);

  // Ranges to price: those staked at either end of the window, and those collected in it.
  const ranges = new Map<string, Range>();
  const rangeOf = (hook: string, id: string) => {
    const key = `${hook}:${id}`;
    if (!ranges.has(key)) ranges.set(key, { hook, id, stakedFrom: 0n, stakedTo: 0n, cut0: 0n, cut1: 0n, collected: false });
    return ranges.get(key)!;
  };
  for (const [byHook, sign] of [[stakedLogs, 1n], [unstakedLogs, -1n]] as [any[][], bigint][]) {
    byHook.forEach((logs, i) => {
      for (const log of logs) {
        const blockNumber = Number(log.blockNumber);
        if (blockNumber > toBlock) continue;
        const range = rangeOf(hooks[i], String(log.args.rangeId));
        const shares = sign * BigInt(log.args.shares);
        range.stakedTo += shares;
        if (blockNumber <= fromBlock) range.stakedFrom += shares;
      }
    });
  }
  collectedLogs.forEach((logs: any[], i: number) => {
    for (const log of logs) {
      if (!inWindow(log)) continue;
      const range = rangeOf(hooks[i], String(log.args.rangeId));
      range.cut0 += BigInt(log.args.stakedCut0);
      range.cut1 += BigInt(log.args.stakedCut1);
      range.collected = true;
    }
  });
  const relevant = [...ranges.values()].filter((r) => r.collected || r.stakedFrom > 0n || r.stakedTo > 0n);
  const rangeKeys = await api.multiCall({ abi: abis.rangeKey, calls: relevant.map((r) => ({ target: r.hook, params: [r.id] })) });
  relevant.forEach((r, i) => {
    r.pool = poolByKey.get(keyOf(rangeKeys[i].key)); // undefined for a pool retired from the registry: not counted, like its swaps
    r.tickLower = Number(rangeKeys[i].tickLower);
    r.tickUpper = Number(rangeKeys[i].tickUpper);
  });

  // Uncollected staked fees only move where fee growth moved (a swap or a donation) or a collection reset them.
  const active = new Set([...swapLogs, ...donateLogs].map((log: any) => String(log.id).toLowerCase()));
  const staked = relevant.filter((r) => r.pool && (r.stakedFrom > 0n || r.stakedTo > 0n) && (r.collected || active.has(r.pool.id)));
  const pendingAt = async (chainApi: any) => {
    const calls = staked.map((r) => ({ target: r.hook, params: [r.id] }));
    const [states, growths, positions] = await Promise.all([
      chainApi.multiCall({ abi: abis.rangeState, calls }),
      chainApi.multiCall({ abi: abis.rangeGrowth, calls }),
      chainApi.multiCall({
        abi: abis.getPositionInfo,
        target: STATE_VIEW,
        calls: staked.map((r) => ({ params: [r.pool!.id, r.hook, r.tickLower, r.tickUpper, "0x" + "00".repeat(32)] })),
      }),
    ]);
    return staked.map((_, i) => pendingStakedCut(states[i], growths[i], positions[i]));
  };
  const [pendingFrom, pendingTo] = await Promise.all([pendingAt(fromApi), pendingAt(api)]);
  staked.forEach((r, i) => {
    r.cut0 += pendingTo[i][0] - pendingFrom[i][0];
    r.cut1 += pendingTo[i][1] - pendingFrom[i][1];
  });

  const cuts: { pool: Pool; amount0: bigint; amount1: bigint; kind: "staked" | "claim" }[] = [];
  for (const r of relevant) if (r.pool && (r.cut0 || r.cut1)) cuts.push({ pool: r.pool, amount0: r.cut0, amount1: r.cut1, kind: "staked" });
  for (const log of accruedLogs) {
    if (!inWindow(log)) continue;
    const pool = pools.get(String(log.args.poolId).toLowerCase());
    if (pool) cuts.push({ pool, amount0: BigInt(log.args.cut0), amount1: BigInt(log.args.cut1), kind: "claim" });
  }

  // Legacy hooks: claim fee skimmed in the window = claimFeeOwed(end) - claimFeeOwed(start) + swept in (start, end].
  if (legacyPools.length) {
    const owedCalls = legacyPools.flatMap((p) => [p.currency0, p.currency1].map((currency) => ({ target: p.hook, params: [currency] })));
    const [owedStart, owedEnd] = await Promise.all([
      fromApi.multiCall({ abi: abis.claimFeeOwed, calls: owedCalls }),
      api.multiCall({ abi: abis.claimFeeOwed, calls: owedCalls }),
    ]);
    legacyPools.forEach((pool, i) => {
      const swept = [0n, 0n];
      for (const log of (sweptLogs as any[][])[i]) {
        if (!inWindow(log)) continue; // already out of the pot at the start reading
        const currency = String(log.args.currency).toLowerCase();
        if (currency === pool.currency0) swept[0] += BigInt(log.args.amount);
        else if (currency === pool.currency1) swept[1] += BigInt(log.args.amount);
      }
      const cut = [0, 1].map((j) => BigInt(owedEnd[2 * i + j]) - BigInt(owedStart[2 * i + j]) + swept[j]);
      if (cut[0] < 0n || cut[1] < 0n) throw new Error(`claimFeeOwed on legacy hook ${pool.hook} fell by more than ClaimFeeSwept paid out`);
      cuts.push({ pool, amount0: cut[0], amount1: cut[1], kind: "claim" });
    });
  }

  // Value both legs of each cut on the pool's valued leg, at the pool price at the window end.
  const pricedPools = [...new Set(cuts.filter((c) => c.amount0 || c.amount1).map((c) => c.pool))];
  const slot0s = await api.multiCall({ abi: abis.getSlot0, target: STATE_VIEW, calls: pricedPools.map((p) => p.id) });
  const price1Per0 = new Map(pricedPools.map((p, i) => [p.id, (Number(slot0s[i].sqrtPriceX96) / 2 ** 96) ** 2]));
  for (const c of cuts) {
    if (!c.amount0 && !c.amount1) continue;
    const price = price1Per0.get(c.pool.id)!;
    const amount0 = Number(c.amount0);
    const amount1 = Number(c.amount1);
    c.pool[c.kind] += c.pool.useToken0 ? amount0 + (price > 0 ? amount1 / price : 0) : amount1 + amount0 * price;
  }

  // Gauge status of each pool that produced revenue in the window, at the window end.
  const revenuePools = [...pools.values()].filter((p) => p.staked > 0 || p.claim > 0);
  const gauges = new Map<string, { live: boolean; voted: boolean; killed: boolean }>();
  if (revenuePools.length) {
    const epoch = await api.call({ target: VOTER, abi: abis.currentEpoch });
    const ids = revenuePools.map((p) => p.id);
    const [classes, states, weights, votes] = await Promise.all([
      api.multiCall({ abi: abis.gaugeClass, target: VOTER, calls: ids }),
      api.multiCall({ abi: abis.gaugeStateAt, target: VOTER, calls: ids.map((id) => ({ params: [id, epoch] })) }),
      api.multiCall({ abi: abis.gaugeWeightNow, target: VOTER, calls: ids }),
      api.multiCall({ abi: abis.votesFor, target: VOTER, calls: ids.map((id) => ({ params: [epoch, id] })) }),
    ]);
    ids.forEach((id, i) => {
      const gauged = Number(classes[i]) !== 0;
      gauges.set(id, {
        live: gauged && Number(states[i]) === GAUGE_LIVE,
        // votes this epoch so far, or standing weight that votesFor has not been checkpointed with yet
        voted: BigInt(weights[i]) > 0n || BigInt(votes[i]) > 0n,
        killed: gauged && Number(states[i]) === GAUGE_EMERGENCY,
      });
    });
  }

  for (const pool of pools.values()) {
    const token = pool.useToken0 ? pool.currency0 : pool.currency1;
    const gauge = gauges.get(pool.id) ?? { live: false, voted: false, killed: false };
    const toForwarder = recipientOf.get(pool.hook) === CLAIM_FEE_FORWARDER;
    let revenue: number;
    if (gauge.killed) {
      dailyProtocolRevenue.add(token, pool.staked + (toForwarder ? pool.claim : 0), LABELS.KILLED_TO_TREASURY);
      if (!toForwarder) dailyProtocolRevenue.add(token, pool.claim, LABELS.CLAIM_TO_TREASURY);
      revenue = pool.staked + pool.claim;
    } else if (gauge.live && gauge.voted) {
      dailyHoldersRevenue.add(token, pool.staked, LABELS.STAKED_TO_VOTERS);
      if (toForwarder) dailyHoldersRevenue.add(token, pool.claim, LABELS.CLAIM_TO_VOTERS);
      else dailyProtocolRevenue.add(token, pool.claim, LABELS.CLAIM_TO_TREASURY);
      revenue = pool.staked + pool.claim;
    } else {
      // no gauge, retired, or no votes: the claim fee goes to the treasury, the staked cut back to its stakers
      dailyProtocolRevenue.add(token, pool.claim, LABELS.CLAIM_TO_TREASURY);
      revenue = pool.claim;
    }
    dailySupplySideRevenue.add(token, pool.swapFees - revenue, METRIC.LP_FEES);
  }

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.addBalances(dailyProtocolRevenue);

  // Bribes forwarded to the voters in the window, net of the team's own share of each (epoch, pool, token) escrow.
  const [bribed, forwarded, bribeFees] = await Promise.all([
    getLogs({ target: BRIBES, eventAbi: BribedEvent, fromBlock: VOTER_BLOCK, toBlock, cacheInCloud: true }),
    getLogs({ target: BRIBES, eventAbi: ForwardedEvent, onlyArgs: false }),
    getLogs({ target: BRIBES, eventAbi: BribeFeeTakenEvent, onlyArgs: false }),
  ]);
  const escrows = new Map<string, { total: bigint; team: bigint }>();
  const escrowKey = (args: any) => [args.epoch, args.poolId, args.token].map((v: any) => String(v).toLowerCase()).join("-");
  for (const args of bribed) {
    const escrow = escrows.get(escrowKey(args)) ?? { total: 0n, team: 0n };
    escrow.total += BigInt(args.amount);
    if (TEAM_BRIBERS.has(String(args.from).toLowerCase())) escrow.team += BigInt(args.amount);
    escrows.set(escrowKey(args), escrow);
  }
  const addToken = (balances: any, token: string, amount: bigint, label: string) => {
    if (token === FABLES) balances.addCGToken("fables", Number(amount) / 1e18, label);
    else balances.add(token, amount, label);
  };
  const partnerShare = (args: any, amount: bigint) => {
    const escrow = escrows.get(escrowKey(args));
    if (!escrow || escrow.total === 0n) throw new Error(`no Bribed escrow for forwarded bribe ${escrowKey(args)}`);
    return (amount * (escrow.total - escrow.team)) / escrow.total;
  };
  for (const log of forwarded) {
    if (!inWindow(log)) continue;
    const amount = partnerShare(log.args, BigInt(log.args.amount));
    if (amount > 0n) addToken(dailyHoldersRevenue, String(log.args.token).toLowerCase(), amount, LABELS.BRIBES_TO_VOTERS);
  }
  for (const log of bribeFees) {
    if (!inWindow(log)) continue;
    const cut = partnerShare(log.args, BigInt(log.args.cut));
    if (cut === 0n) continue;
    const token = String(log.args.token).toLowerCase();
    addToken(dailyFees, token, cut, LABELS.BRIBE_FEES);
    addToken(dailyRevenue, token, cut, LABELS.BRIBE_FEES_TO_TREASURY);
    addToken(dailyProtocolRevenue, token, cut, LABELS.BRIBE_FEES_TO_TREASURY);
  }

  return { dailyVolume, dailyFees, dailyUserFees, dailySupplySideRevenue, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
};

const methodology = {
  Volume:
    "Swap volume across every Fables pool, enumerated from the on-chain FablesPoolRegistry and read from the Uniswap v4 PoolManager Swap logs, counted on the native or core-asset leg.",
  Fees: "Swap fees paid by traders at the dynamic fee carried in each Swap event, plus any fee FablesBribes takes from bribes (0% so far).",
  UserFees: "Swap fees paid by traders at the dynamic fee carried in each Swap event.",
  Revenue:
    "From the ve(3,3) launch on 2026-10-20: swap fees earned by liquidity staked in gauges (booked as they accrue) and the 10% claim fee taken from unstaked ledger liquidity (booked when the ledger skims it), paid to veFABLES voters or to the treasury. Not broken out before the launch (reported as 0), when the claim fee went to the treasury.",
  HoldersRevenue:
    "From 2026-10-20: swap fees earned by liquidity staked in a gauge that has votes and the claim fee taken from unstaked liquidity in those pools, paid to the pool's veFABLES voters, plus bribes from other parties forwarded to those voters (bribes paid by the Fables team excluded).",
  ProtocolRevenue:
    "From 2026-10-20: the claim fee taken from unstaked ledger liquidity in pools without a gauge or without votes, and on hooks whose claim-fee recipient is a treasury Safe, plus the fees of emergency-killed gauges and any bribe fee. Vote-churn penalties are not included.",
  SupplySideRevenue:
    "Swap fees kept by liquidity providers: from 2026-10-20, unstaked ledger LPs after the claim fee, LPs holding plain Uniswap v4 positions in Fables pools, and stakers refunded when their gauge has no votes; before it, every swap fee.",
};

const CLAIM_TO_TREASURY_TEXT =
  "The claim fee taken from unstaked ledger liquidity paid to the treasury: pools without a gauge or without votes, and hooks whose claim-fee recipient is a treasury Safe.";
const KILLED_TEXT = "Fees of liquidity staked in an emergency-killed gauge, and its claim fee, paid to the treasury for that epoch.";
const BRIBE_FEE_TEXT = "The protocol cut taken from bribes when they are forwarded to voters (0% so far).";
const STAKED_TEXT = "Swap fees earned by ledger shares staked in a gauge that has votes, booked as they accrue and paid to that gauge's veFABLES voters.";
const CLAIM_TO_VOTERS_TEXT = "The claim fee (10%) taken from unstaked ledger liquidity in pools whose gauge has votes, forwarded to the epoch distributor for the voters.";

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Dynamic swap fees paid by traders, taken from each Uniswap v4 Swap event.",
    [LABELS.BRIBE_FEES]: "The cut FablesBribes takes from bribes when they are forwarded to voters (0% so far).",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Dynamic swap fees paid by traders, taken from each Uniswap v4 Swap event.",
  },
  Revenue: {
    [LABELS.STAKED_TO_VOTERS]: STAKED_TEXT,
    [LABELS.CLAIM_TO_VOTERS]: CLAIM_TO_VOTERS_TEXT,
    [LABELS.CLAIM_TO_TREASURY]: CLAIM_TO_TREASURY_TEXT,
    [LABELS.KILLED_TO_TREASURY]: KILLED_TEXT,
    [LABELS.BRIBE_FEES_TO_TREASURY]: BRIBE_FEE_TEXT,
  },
  HoldersRevenue: {
    [LABELS.STAKED_TO_VOTERS]: STAKED_TEXT,
    [LABELS.CLAIM_TO_VOTERS]: CLAIM_TO_VOTERS_TEXT,
    [LABELS.BRIBES_TO_VOTERS]:
      "Bribes other parties post on FablesBribes for a pool's veFABLES voters, counted when forwarded to the voters' distributor, net of any bribe fee. Bribes paid from Fables team Safes are excluded.",
  },
  ProtocolRevenue: {
    [LABELS.CLAIM_TO_TREASURY]: CLAIM_TO_TREASURY_TEXT,
    [LABELS.KILLED_TO_TREASURY]: KILLED_TEXT,
    [LABELS.BRIBE_FEES_TO_TREASURY]: BRIBE_FEE_TEXT,
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Swap fees kept by liquidity providers: unstaked ledger LPs after the claim fee, plain Uniswap v4 positions in Fables pools, and staked LPs refunded when their gauge has no votes (before 2026-10-20, every swap fee).",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-18", // FablesPoolRegistry was deployed on 2026-08-17 05:18 UTC
  doublecounted: true, // most Fables pools are also counted by dexs/uniswap-v4.ts
  methodology,
  breakdownMethodology,
};

export default adapter;
