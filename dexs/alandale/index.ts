import { CHAIN } from '../../helpers/chains';
import { FetchOptions, IJSON, SimpleAdapter } from '../../adapters/types';
import { addOneToken } from '../../helpers/prices';
import { METRIC } from '../../helpers/metrics';

const FACTORY = '0x16494A80E08Bcb9285D87b67149d7b01774D82F8';
const FROM_BLOCK = 27941500;

const poolCreatedEvent = 'event Pool(address indexed token0, address indexed token1, address pool)';
const swapEvent =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)';
const feeEvent = 'event Fee(uint16 fee)';
const communityFeeEvent = 'event CommunityFee(uint16 communityFeeNew)';
const defaultFeeEvent = 'event DefaultFee(uint16 newDefaultFee)';
const defaultCommunityFeeEvent = 'event DefaultCommunityFee(uint8 newDefaultCommunityFee)';

const FEE_DENOMINATOR = 1e6;
const COMMUNITY_FEE_DENOMINATOR = 1e3;

type Point = { block: number; index: number; value: number };

const toPoints = (logs: any[]): Point[] =>
  logs
    .map((log: any) => ({
      block: Number(log.blockNumber),
      index: Number(log.logIndex),
      value: Number(log.args[0]),
    }))
    .sort((a, b) => a.block - b.block || a.index - b.index);

const valueAt = (points: Point[], block: number, index: number, fallback: number): number => {
  let out = fallback;
  for (const p of points) {
    if (p.block > block || (p.block === block && p.index > index)) break;
    out = p.value;
  }
  return out;
};

const methodology = {
  Volume: 'Swap volume across Alandale concentrated-liquidity pools, counted once per swap.',
  Fees: "All swap fees paid by traders, using each pool's Algebra dynamic fee as it stood at the block of each swap.",
  UserFees: 'All swap fees paid by traders.',
  Revenue: "Swap fees routed out of the pool to the fee vault, taken from each pool's on-chain community fee. This is the veLUTE voters' share.",
  HoldersRevenue:
    'Vault-routed swap fees, forwarded through the pool gauge to veLUTE voters. The fee vault sends its entire take to the gauge, so this equals Revenue.',
  SupplySideRevenue:
    'Swap fees kept by liquidity providers. LPs do not earn fees while a pool routes its full community fee onward; instead they are compensated with LUTE emissions. Currently zero, since every pool routes 100%.',
};

const LOCKER_FEES = 'Swap Fees to veLUTE lockers';

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Swap fees collected from all pools.',
  },
  Revenue: {
    [LOCKER_FEES]: 'Portion of swap fees going to the veLUTE lockers.',
  },
  HoldersRevenue: {
    [LOCKER_FEES]: 'Portion of swap fees going to the veLUTE lockers.',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Portion of swap fees kept by liquidity providers.',
  },
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain } = options;

  const cached = { fromBlock: FROM_BLOCK, entireLog: true, cacheInCloud: true, parseLog: true } as const;

  const poolLogs = await getLogs({ target: FACTORY, eventAbi: poolCreatedEvent, fromBlock: FROM_BLOCK, cacheInCloud: true });
  const pairObject: IJSON<string[]> = {};
  poolLogs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1];
  });
  const pools = Object.keys(pairObject);

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const empty = {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
  if (!pools.length) return empty;

  const defaultFeeLogs = await getLogs({ target: FACTORY, eventAbi: defaultFeeEvent, ...cached });
  const defaultCommunityLogs = await getLogs({ target: FACTORY, eventAbi: defaultCommunityFeeEvent, ...cached });
  const feeLogs = await getLogs({ targets: pools, eventAbi: feeEvent, flatten: false, ...cached });
  const communityLogs = await getLogs({ targets: pools, eventAbi: communityFeeEvent, flatten: false, ...cached });
  const swapLogs = await getLogs({ targets: pools, eventAbi: swapEvent, flatten: false, entireLog: true });

  const defaultFees = toPoints(defaultFeeLogs);
  const defaultCommunityFees = toPoints(defaultCommunityLogs);

  pools.forEach((pool, i) => {
    const logs = swapLogs[i];
    if (!logs?.length) return;

    const [token0, token1] = pairObject[pool];
    const poolFees = toPoints(feeLogs[i] ?? []);
    const poolCommunityFees = toPoints(communityLogs[i] ?? []);

    logs.forEach((log: any) => {
      const block = Number(log.blockNumber);
      const index = Number(log.logIndex);
      const args = log.args;
      if (!args) return;

      const fee =
        valueAt(poolFees, block, index, valueAt(defaultFees, block, Infinity, 0)) / FEE_DENOMINATOR;
      const communityShare =
        valueAt(poolCommunityFees, block, index, valueAt(defaultCommunityFees, block, Infinity, 0)) /
        COMMUNITY_FEE_DENOMINATOR;

      const amount0 = args.amount0;
      const amount1 = args.amount1;
      const fee0 = amount0.toString() * fee;
      const fee1 = amount1.toString() * fee;

      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 });
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: fee0, amount1: fee1, label: METRIC.SWAP_FEES });
      addOneToken({
        chain,
        balances: dailyHoldersRevenue,
        token0,
        token1,
        amount0: fee0 * communityShare,
        amount1: fee1 * communityShare,
        label: LOCKER_FEES,
      });
      addOneToken({
        chain,
        balances: dailySupplySideRevenue,
        token0,
        token1,
        amount0: fee0 * (1 - communityShare),
        amount1: fee1 * (1 - communityShare),
        label: METRIC.LP_FEES,
      });
    });
  });

  dailyRevenue.addBalances(dailyHoldersRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-08-04',
  methodology,
  breakdownMethodology,
};

export default adapter;
