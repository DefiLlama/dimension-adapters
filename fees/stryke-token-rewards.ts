import { getProvider } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getPositionedLogArgs } from '../helpers/logs';

// Public app config: https://app.stryke.xyz. Accounting/events:
// https://github.com/stryke-xyz/lumbridge/blob/master/src/governance/StakedSYK.sol
const staking = '0x20b2431557bB90954744a6D404f45aD1aD8719f4';
// Immutable syk() underlying, matched to the constructor in the creation receipt:
// https://robinhoodchain.blockscout.com/tx/0xf50238eee6f7e34290f153d8209e9027e2baf3c6e79d89e86ab0fe811c311e59
const syk = '0x97c065eed0309f182777bffa41a9c0027c190df1';
const stakingFromBlock = 83382171; // Same creation receipt.
// Claimed ABI is published in this contract's verified Blockscout source:
// https://robinhoodchain.blockscout.com/address/0x1Bfa26a0dc850B3a9B7586Cc6f8f868B5204a3F1?tab=contract
const distributor = '0x1Bfa26a0dc850B3a9B7586Cc6f8f868B5204a3F1';
const distributorStart = 1793145600; // 2026-10-28; no pre-deployment claims.

type RewardEvent = { kind: string; blockNumber: number; logIndex: number; [key: string]: any };

/** Replay schedules and active-stake transitions; accrue only inside [from, to). */
export async function replayAccrual(events: RewardEvent[], from: number, to: number, blockTime: (block: number) => Promise<number>) {
  const schedules = new Map<string, { rate: bigint; finish: number; updated: number }>();
  const earned = new Map<string, bigint>();
  let supply = 0n;
  const accrue = (timestamp: number) => {
    for (const [token, schedule] of schedules) {
      const end = Math.min(timestamp, schedule.finish, to);
      const start = Math.max(schedule.updated, from);
      if (supply > 0n && end > start)
        earned.set(token, (earned.get(token) ?? 0n) + schedule.rate * BigInt(end - start));
      schedule.updated = Math.max(schedule.updated, Math.min(timestamp, schedule.finish));
    }
  };
  for (const event of [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)) {
    if (event.kind === 'RewardNotified') {
      const timestamp = await blockTime(event.blockNumber);
      if (timestamp >= to) break;
      accrue(timestamp);
      const duration = Number(event.finishAt) - timestamp;
      if (duration <= 0 || BigInt(event.amount) % BigInt(duration) !== 0n)
        throw new Error('Invalid StakedSYK reward schedule');
      schedules.set(event.token.toLowerCase(), { rate: BigInt(event.amount) / BigInt(duration), finish: Number(event.finishAt), updated: timestamp });
    } else {
      const next = supply + (event.kind === 'UnstakeInitiated' ? -BigInt(event.amount) : BigInt(event.amount));
      if (next < 0n) throw new Error('Incomplete StakedSYK supply event history');
      // Only zero/nonzero transitions change aggregate accrual. Read headers
      // sequentially for those transitions, never historical contract state.
      if ((supply === 0n) !== (next === 0n)) {
        const timestamp = await blockTime(event.blockNumber);
        if (timestamp >= to) break;
        accrue(timestamp);
      }
      supply = next;
    }
  }
  accrue(to);
  return earned;
}

/** Reconstruct staker accrual from logs; count Merkle rewards on successful payment. */
export async function fetchHolders(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances();
  const toBlock = await options.getToBlock();
  if (toBlock >= stakingFromBlock) {
    const added = await options.getLogs({ target: staking, fromBlock: stakingFromBlock, toBlock, eventAbi: 'event RewardAdded(address indexed token,uint256 duration)' });
    const rewards = new Set(added.map(log => log.token.toLowerCase()).filter(token => token !== syk));
    if (rewards.size) {
      const events: RewardEvent[] = [];
      for (const [kind, fields] of [
        ['Staked', 'address indexed account,uint256 amount'],
        ['UnstakeInitiated', 'address indexed account,uint256 amount,uint256 unlockAt,uint256 index,uint256 penaltyBps'],
        ['UnstakeCancelled', 'address indexed account,uint256 amount,uint256 index'],
        ['RewardNotified', 'address indexed token,uint256 amount,uint256 finishAt'],
      ]) {
        const logs = await getPositionedLogArgs(options, { target: staking, fromBlock: stakingFromBlock, toBlock, eventAbi: 'event ' + kind + '(' + fields + ')' });
        events.push(...logs.filter(log => kind !== 'RewardNotified' || rewards.has(log.token.toLowerCase())).map(log => ({ ...log, kind })));
      }
      const times = new Map<number, number>();
      const blockTime = async (block: number) => {
        if (!times.has(block)) {
          const header = await getProvider(options.chain)!.getBlock(block);
          if (!header) throw new Error('Missing StakedSYK block header ' + block);
          times.set(block, header.timestamp);
        }
        return times.get(block)!;
      };
      const earned = await replayAccrual(events, options.startTimestamp, options.endTimestamp, blockTime);
      for (const [token, amount] of earned)
        dailyHoldersRevenue.add(token, amount.toString(), 'SYK Staker Reward Accrual');
    }
  }
  if (options.endTimestamp > distributorStart) {
    const claims = await options.getLogs({ target: distributor, eventAbi: 'event Claimed(address indexed account,address indexed token,uint256 amount)' });
    for (const log of claims) {
      if (log.token.toLowerCase() === syk) continue;
      dailyHoldersRevenue.add(log.token, log.amount.toString(), 'sykASH Reward Claims');
    }
  }
  return { dailyHoldersRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-12',
  fetch: fetchHolders,
  // https://docs.stryke.xyz/tokenomics/protocol-fees: rewards pool several products.
  // Register once at the Stryke parent; do not duplicate RFQ trading revenue.
  methodology: {
    HoldersRevenue: 'Non-SYK rewards accrued by SYK stakers plus non-SYK rewards successfully claimed through the new sykASH distributor. Staking replays reward schedules and active stake from on-chain events, excluding idle periods; claims are not counted again. sykASH uses payment dates because historical allocation totals are not exposed. Covers these two reward programs across products, not an estimated RFQ fee split. Excludes own-token emissions and unverified buybacks.',
  },
  breakdownMethodology: {
    HoldersRevenue: {
      'SYK Staker Reward Accrual': 'RewardNotified streamed amount divided by its duration, accrued while active stake is nonzero. Replays Staked, UnstakeInitiated and UnstakeCancelled from deployment; replacement schedules supersede unearned rewards. Funding, claims and recoveries do not add income.',
      'sykASH Reward Claims': 'Incremental Claimed event amounts from the verified Merkle distributor, excluding SYK. Funding and recoveries are not income.',
    },
  },
};
export default adapter;
