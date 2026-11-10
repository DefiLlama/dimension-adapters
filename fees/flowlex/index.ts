import { ChainApi } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics';

// Flowlex (https://flowlex.com) opens and manages Uniswap V3 positions for its users. It is non-custodial: the LP
// manager mints each position and sends the NFT to the user's own smart wallet. Commissions are paid to the treasury by
// the manager. Rates are on-chain (CommissionUpdated events) and have changed over time, so revenue is read from the
// actual treasury transfers, not from a hardcoded rate.
const TREASURY = '0x456C2C950Ee2AE7cdd08bBE6ec0D46212D42FCF1'; // manager.treasury(), never changed (no TreasuryUpdated event): https://basescan.org/address/0x456C2C950Ee2AE7cdd08bBE6ec0D46212D42FCF1

type ChainConfig = { start: string; manager: string; managerFromBlock: number; nfpm: string };

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.BASE]: {
    start: '2026-04-09', // manager deploy, block 44474281
    manager: '0xE20435aC8160aa58ADea4A1fc5641bB5aDAED053', // Flowlex LP manager, https://basescan.org/address/0xE20435aC8160aa58ADea4A1fc5641bB5aDAED053
    managerFromBlock: 44474281,
    nfpm: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1', // Uniswap V3 NonfungiblePositionManager
  },
};

const managerAbi: Record<string, string> = {
  PoolAdded: 'event PoolAdded(address indexed pool, address token0, address token1, uint24 fee)',
  PositionOpened: 'event PositionOpened(address indexed user, uint256 indexed tokenId, address pool, uint256 depositAmount, uint256 commission)',
  FeesClaimed: 'event FeesClaimed(address indexed user, uint256 indexed tokenId, uint256 grossAmount0, uint256 grossAmount1, uint256 netToUser0, uint256 netToUser1)',
  PositionWithdrawn: 'event PositionWithdrawn(address indexed user, uint256 indexed tokenId, uint256 grossAmount0, uint256 grossAmount1, uint256 netToUser0, uint256 netToUser1)',
  PositionRebalanced: 'event PositionRebalanced(address indexed user, uint256 indexed oldTokenId, uint256 indexed newTokenId)',
};

const abi = {
  transfer: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  collect: 'event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)',
  decreaseLiquidity: 'event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  positions: 'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  factory: 'function factory() view returns (address)',
  getPool: 'function getPool(address, address, uint24) view returns (address)',
  slot0: 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  feeGrowthGlobal0X128: 'function feeGrowthGlobal0X128() view returns (uint256)',
  feeGrowthGlobal1X128: 'function feeGrowthGlobal1X128() view returns (uint256)',
  ticks: 'function ticks(int24) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)',
  token0: 'address:token0',
  token1: 'address:token1',
};

// Which operation a commission belongs to. Claim commissions are a cut of the LP fees the position earned; the others
// are charged on the position's capital (deposit, close, rebalance).
type Kind = 'claim' | 'open' | 'close' | 'rebalance';
const KIND_BY_EVENT: Record<string, Kind> = {
  FeesClaimed: 'claim',
  PositionOpened: 'open',
  PositionWithdrawn: 'close',
  PositionRebalanced: 'rebalance',
};

const LABELS = {
  lpFees: METRIC.LP_FEES,
  lpFeesToUsers: 'LP Fees To Users',
  lpFeesToTreasury: 'LP Fees Commission To Treasury',
  depositFees: 'Deposit Fees',
  closeFees: 'Close Fees',
  rebalanceFees: 'Rebalance Fees',
  depositFeesToTreasury: 'Deposit Fees To Treasury',
  closeFeesToTreasury: 'Close Fees To Treasury',
  rebalanceFeesToTreasury: 'Rebalance Fees To Treasury',
};

const Q128 = 2n ** 128n;
const WORD = 2n ** 256n;
const wrap = (x: bigint) => ((x % WORD) + WORD) % WORD;
// keccak256('Transfer(address,address,uint256)')
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicOf = (address: string) => '0x' + address.toLowerCase().replace('0x', '').padStart(64, '0');

type Position = { token0: string; token1: string; fee: string; tickLower: number; tickUpper: number; liquidity: bigint; last: [bigint, bigint]; owed: [bigint, bigint] };

// Every position the manager ever minted, plus the pool of each (used for the token pair of positions minted and
// burned within one window).
async function getPositionIds(options: FetchOptions, cfg: ChainConfig) {
  const toBlock = await options.getToBlock();
  const logs = (event: string) => options.getLogs({ target: cfg.manager, eventAbi: managerAbi[event], fromBlock: cfg.managerFromBlock, toBlock, cacheInCloud: true });
  const opened = await logs('PositionOpened');
  const rebalanced = await logs('PositionRebalanced');

  const poolOf: Record<string, string> = {};
  for (const l of opened) poolOf[String(l.tokenId)] = l.pool;
  // A rebalance keeps the pool
  for (const l of rebalanced) if (poolOf[String(l.oldTokenId)]) poolOf[String(l.newTokenId)] = poolOf[String(l.oldTokenId)];

  const ids = new Set<string>([...opened.map(l => String(l.tokenId)), ...rebalanced.map(l => String(l.newTokenId))]);
  return { ids: [...ids], poolOf };
}

async function readPositions(api: ChainApi, nfpm: string, ids: string[]): Promise<(Position | null)[]> {
  // positions() reverts for a token id that is not minted yet or already burned: it holds nothing then
  const raw = await api.multiCall({ abi: abi.positions, target: nfpm, calls: ids, permitFailure: true });
  // A failed call in the batch is retried alone: it counts as empty only when the position manager confirms the id
  // does not exist; any other failure (e.g. RPC) throws instead of booking a false change in collectable fees.
  for (let i = 0; i < ids.length; i++) {
    if (raw[i]) continue;
    try {
      raw[i] = await api.call({ abi: abi.positions, target: nfpm, params: [ids[i]] });
    } catch (e: any) {
      if (!String(e?.message ?? e).includes('Invalid token ID')) throw e;
    }
  }
  return raw.map((p: any) => p ? {
    token0: p.token0, token1: p.token1, fee: String(p.fee), tickLower: Number(p.tickLower), tickUpper: Number(p.tickUpper),
    liquidity: BigInt(p.liquidity),
    last: [BigInt(p.feeGrowthInside0LastX128), BigInt(p.feeGrowthInside1LastX128)],
    owed: [BigInt(p.tokensOwed0), BigInt(p.tokensOwed1)],
  } : null);
}

// What collect() would pay at the api's block: tokensOwed plus liquidity times the fee growth inside the range since
// the position's last snapshot (Uniswap V3 Tick.getFeeGrowthInside, modulo 2^256). tokensOwed also holds principal from
// a decreaseLiquidity that has not been collected yet; DecreaseLiquidity events take that back out below.
async function owedAt(api: ChainApi, factory: string, positions: (Position | null)[]): Promise<[bigint, bigint][]> {
  const live = positions.map((p, i) => ({ p, i })).filter(x => x.p) as { p: Position; i: number }[];
  const result: [bigint, bigint][] = positions.map(() => [0n, 0n]);
  if (!live.length) return result;

  const pools = await api.multiCall({ abi: abi.getPool, target: factory, calls: live.map(({ p }) => ({ params: [p.token0, p.token1, p.fee] })) });
  const uniquePools = [...new Set(pools as string[])];
  const slot0s = await api.multiCall({ abi: abi.slot0, calls: uniquePools });
  const global0 = await api.multiCall({ abi: abi.feeGrowthGlobal0X128, calls: uniquePools });
  const global1 = await api.multiCall({ abi: abi.feeGrowthGlobal1X128, calls: uniquePools });
  const lowers = await api.multiCall({ abi: abi.ticks, calls: live.map(({ p }, j) => ({ target: pools[j], params: [p.tickLower] })) });
  const uppers = await api.multiCall({ abi: abi.ticks, calls: live.map(({ p }, j) => ({ target: pools[j], params: [p.tickUpper] })) });
  const state: Record<string, { tick: number; global: [bigint, bigint] }> = {};
  uniquePools.forEach((pool, k) => { state[pool] = { tick: Number(slot0s[k].tick), global: [BigInt(global0[k]), BigInt(global1[k])] }; });

  live.forEach(({ p, i }, j) => {
    const { tick, global } = state[pools[j]];
    const outsideLower = [BigInt(lowers[j].feeGrowthOutside0X128), BigInt(lowers[j].feeGrowthOutside1X128)];
    const outsideUpper = [BigInt(uppers[j].feeGrowthOutside0X128), BigInt(uppers[j].feeGrowthOutside1X128)];
    result[i] = [0, 1].map(k => {
      const below = tick >= p.tickLower ? outsideLower[k] : wrap(global[k] - outsideLower[k]);
      const above = tick < p.tickUpper ? outsideUpper[k] : wrap(global[k] - outsideUpper[k]);
      const inside = wrap(global[k] - below - above);
      return p.owed[k] + p.liquidity * wrap(inside - p.last[k]) / Q128;
    }) as [bigint, bigint];
  });
  return result;
}

const fetch = async (options: FetchOptions) => {
  const cfg = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const toBlock = await options.getToBlock();

  const { ids, poolOf } = await getPositionIds(options, cfg);
  const idSet = new Set(ids);

  // 1. LP fees earned by Flowlex positions in the window:
  //    (collectable at end - collectable at start) + collected during the window - principal removed during the window
  const factory = await options.toApi.call({ abi: abi.factory, target: cfg.nfpm });
  const before = await readPositions(options.fromApi, cfg.nfpm, ids);
  const after = await readPositions(options.toApi, cfg.nfpm, ids);
  const owedBefore = await owedAt(options.fromApi, factory, before);
  const owedAfter = await owedAt(options.toApi, factory, after);
  const collects = await options.getLogs({ target: cfg.nfpm, eventAbi: abi.collect });
  const decreases = await options.getLogs({ target: cfg.nfpm, eventAbi: abi.decreaseLiquidity });

  const earned: Record<string, [bigint, bigint]> = {};
  ids.forEach((id, i) => { earned[id] = [owedAfter[i][0] - owedBefore[i][0], owedAfter[i][1] - owedBefore[i][1]]; });
  for (const l of collects) {
    const id = String(l.tokenId);
    if (!idSet.has(id)) continue;
    earned[id][0] += BigInt(l.amount0);
    earned[id][1] += BigInt(l.amount1);
  }
  for (const l of decreases) {
    const id = String(l.tokenId);
    if (!idSet.has(id)) continue;
    earned[id][0] -= BigInt(l.amount0);
    earned[id][1] -= BigInt(l.amount1);
  }

  // Token pair of each position: from positions() at either end, else from its pool (minted and burned in the window)
  const missing = ids.filter((id, i) => !after[i] && !before[i] && (earned[id][0] !== 0n || earned[id][1] !== 0n));
  const missingPools = [...new Set(missing.map(id => poolOf[id]))];
  if (missingPools.some(p => !p)) throw new Error(`Flowlex: no token pair for positions ${missing.filter(id => !poolOf[id]).join(',')}`);
  const mt0 = await options.toApi.multiCall({ abi: abi.token0, calls: missingPools });
  const mt1 = await options.toApi.multiCall({ abi: abi.token1, calls: missingPools });
  const pairOfPool: Record<string, [string, string]> = {};
  missingPools.forEach((pool, k) => { pairOfPool[pool] = [mt0[k], mt1[k]]; });

  ids.forEach((id, i) => {
    const p = after[i] ?? before[i];
    const [t0, t1] = p ? [p.token0, p.token1] : (pairOfPool[poolOf[id]] ?? [null, null]);
    if (!t0 || !t1) return; // nothing earned (checked above)
    dailyFees.add(t0, earned[id][0], LABELS.lpFees);
    dailyFees.add(t1, earned[id][1], LABELS.lpFees);
    dailySupplySideRevenue.add(t0, earned[id][0], LABELS.lpFeesToUsers);
    dailySupplySideRevenue.add(t1, earned[id][1], LABELS.lpFeesToUsers);
  });

  // 2. Commissions: every token transfer from the manager to the treasury in the window, attributed to the operation
  //    event the manager emits next in the same transaction (commissions are paid before the operation's event, and one
  //    transaction can batch several operations).
  const poolAdded = await options.getLogs({ target: cfg.manager, eventAbi: managerAbi.PoolAdded, fromBlock: cfg.managerFromBlock, toBlock, cacheInCloud: true });
  const tokens = [...new Set(poolAdded.flatMap(l => [l.token0.toLowerCase(), l.token1.toLowerCase()]))];
  const transfers = tokens.length
    ? await options.getLogs({ targets: tokens, eventAbi: abi.transfer, topics: [TRANSFER_TOPIC, topicOf(cfg.manager), topicOf(TREASURY)], entireLog: true, parseLog: true })
    : [];

  if (transfers.length) {
    const opLogs: any[] = [];
    for (const event of Object.keys(KIND_BY_EVENT)) {
      const logs = await options.getLogs({ target: cfg.manager, eventAbi: managerAbi[event], entireLog: true, parseLog: true });
      opLogs.push(...logs.map(l => ({ ...l, kind: KIND_BY_EVENT[event] })));
    }

    for (const t of transfers) {
      const next = opLogs
        .filter(o => o.transactionHash === t.transactionHash && Number(o.logIndex) > Number(t.logIndex))
        .sort((a, b) => Number(a.logIndex) - Number(b.logIndex))[0];
      if (!next) throw new Error(`Flowlex: commission transfer without an operation event in ${t.transactionHash}`);
      const token = t.address;
      const amount = BigInt(t.args.value);
      if (next.kind === 'claim') {
        // A cut of LP fees already counted above: moves from users to the treasury
        dailyRevenue.add(token, amount, LABELS.lpFeesToTreasury);
        dailySupplySideRevenue.subtractToken(token, amount, LABELS.lpFeesToUsers);
      } else {
        const [fees, toTreasury] = next.kind === 'open'
          ? [LABELS.depositFees, LABELS.depositFeesToTreasury]
          : next.kind === 'close' ? [LABELS.closeFees, LABELS.closeFeesToTreasury] : [LABELS.rebalanceFees, LABELS.rebalanceFeesToTreasury];
        dailyFees.add(token, amount, fees);
        dailyRevenue.add(token, amount, toTreasury);
      }
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const revenueBreakdown = {
  [LABELS.lpFeesToTreasury]: 'Commission taken from LP fees when they are claimed.',
  [LABELS.depositFeesToTreasury]: 'Deposit commissions paid to the treasury.',
  [LABELS.closeFeesToTreasury]: 'Close commissions paid to the treasury.',
  [LABELS.rebalanceFeesToTreasury]: 'Rebalance commissions paid to the treasury.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true, // the LP fees are swap fees of Uniswap V3 pools, already counted by the Uniswap adapters
  // LP fees earned in a window can be slightly negative by a few raw units when collectable fees are rounded down at
  // one end of the window; and a claim commission is booked when it is paid, which can be in a later window than the
  // fees it is taken from, so users' share of a single window can dip below zero.
  allowNegativeValue: true,
  methodology: {
    Fees: 'Swap fees earned by Uniswap V3 positions opened through the Flowlex LP manager, including fees not collected yet, plus commissions charged on deposits, closes and rebalances.',
    Revenue: 'Commissions paid to the Flowlex treasury, read from token transfers from the LP manager to the treasury.',
    ProtocolRevenue: 'Commissions paid to the Flowlex treasury.',
    SupplySideRevenue: 'Swap fees earned by users\' positions, minus the commission Flowlex takes when fees are claimed.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.lpFees]: 'Swap fees earned by Flowlex positions: the change in what each position could collect (tokensOwed plus fee growth inside its range) between the start and end of the window, plus the amounts collected (Collect) minus the principal removed (DecreaseLiquidity) during the window.',
      [LABELS.depositFees]: 'Commission charged on deposits when a position is opened.',
      [LABELS.closeFees]: 'Commission charged when a position is closed. It is charged on the closed amount, which includes the position\'s uncollected fees.',
      [LABELS.rebalanceFees]: 'Commission charged when a position is moved to a new range.',
    },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: {
      [LABELS.lpFeesToUsers]: 'Swap fees earned by users\' positions after the commission taken on claims.',
    },
  },
};

export default adapter;
