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

// 2026-10-27 flash loan exploit wallets
const EXPLOIT_SENDERS = new Set([
  '0x1ca808a5f90719916794b2afa947ae47db78434d',
  '0x24200d29e2822239f71e0e279b38d6cbfcc71608',
  '0x3329031f09b33bf872ac5a48c6b114a6fcaa0179',
  '0x3557b3e7964b9915de02804041419b968d607595',
  '0x3d7de716cc83e7a4b4f3372a7af0fb218d63898b',
  '0x54276a09f868c91e46bd9ff05d73462f9ad04064',
  '0x552812dfe6d24b78e16d00c00c9a0482c92fd2bb',
  '0x5cc2499c82f0d58497b50f701e5e3c569368e825',
  '0x5d1d94cc0f2347b015cfbad37b036e6977179455',
  '0x5f44da8f248d2a61a0bf69c439ac45110eaed272',
  '0x7744fe376c34b2d10c8e1f356573c1272ab4de68',
  '0x7ef3f545e060bee1b2298dd481490b0ee621d9ce',
  '0x9c875a6480daa7fc1fd0a141b780f68881067273',
  '0xa380fa7166cfda74cbee2a952b7546408e915259',
  '0xa4c6e695c41e2f1b34dc87a276b742baff028811',
  '0xab9d3c7a26cb365719543decb20ceca420c09cc0',
  '0xb25652eadcf794c5cf1ac86ed5f2fd63b1cf8bec',
  '0xb649d65e75ab19005b02ec3f9d35e2f72ceb1b7b',
  '0xc32e118ae7a91931bcdf5de98ae2b69191f2bb99',
  '0xc459fc154d01bb4c159b834eeb14ccc3afb84eb2',
  '0xc81eeb349874b32e34bf75fbd413e95fa9afe9d4',
  '0xe17809fea1684ff0a753f9239c4fee0c0472a5d8',
  '0xe5221ae40c86fa37447c4526a05ee63b94ca80cb',
  '0xfb1c38e5d287d070c5f7c158bdc2b2e07fcfa2b4',
]);

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

      if (!EXPLOIT_SENDERS.has(args.sender.toLowerCase()))
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
