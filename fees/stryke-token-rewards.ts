import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Public frontend config: app.stryke.xyz. Source:
// github.com/stryke-xyz/lumbridge/blob/master/src/governance/StakedSYK.sol
const staking = '0x20b2431557bB90954744a6D404f45aD1aD8719f4';
// Verified source: robinhoodchain.blockscout.com/address/<address>?tab=contract
const distributor = '0x1Bfa26a0dc850B3a9B7586Cc6f8f868B5204a3F1';
const distributorStart = 1793145600; // 2026-10-28; no pre-deployment claims.
const dataAbi = 'function rewardData(address) view returns (uint256 duration,uint256 finishAt,uint256 updatedAt,uint256 rewardRate,uint256 rewardPerTokenStored)';

// rewardReserved includes accrued liabilities AND future scheduled rewards.
// When supply is zero, not-yet-checkpointed idle rewards must also be removed.
// This reproduces StakedSYK._updateRewards without counting a new notification
// as immediate income or counting previously accrued claims a second time.
export function earnedLiability(reserved: string, data: any, supply: string, timestamp: number): bigint {
  const finish = Number(data.finishAt ?? data[1]);
  const updated = Number(data.updatedAt ?? data[2]);
  const rate = BigInt(data.rewardRate ?? data[3]);
  const cutoff = BigInt(supply) === 0n ? updated : timestamp;
  const unearned = rate * BigInt(Math.max(0, finish - cutoff));
  const earned = BigInt(reserved) - unearned;
  if (earned < 0n) throw new Error('Inconsistent StakedSYK reward reserve');
  return earned;
}

export async function fetchHolders(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances();
  const tokens: string[] = await options.toApi.call({ target: staking, abi: 'address[]:getRewardTokens' });
  const syk: string = await options.toApi.call({ target: staking, abi: 'address:syk' });
  // Own-token distributions could be emissions; do not classify them as revenue
  // without evidence of fee-funded buybacks. Other reward assets are holder income.
  const rewards = tokens.filter(t => t.toLowerCase() !== syk.toLowerCase());
  if (rewards.length) {
    const paid = await options.getLogs({ target: staking, eventAbi: 'event RewardPaid(address indexed account,address indexed token,uint256 amount)' });
    const states: { supply: string; reserved: string[]; data: any[] }[] = [];
    for (const api of [options.fromApi, options.toApi]) {
      const supply = await api.call({ target: staking, abi: 'uint256:totalSupply' });
      const reserved = await api.multiCall({ target: staking, abi: 'function rewardReserved(address) view returns (uint256)', calls: rewards.map(token => ({ params: [token] })) });
      const data = await api.multiCall({ target: staking, abi: dataAbi, calls: rewards.map(token => ({ params: [token] })) });
      states.push({ supply, reserved, data });
    }
    rewards.forEach((token, i) => {
      const start = earnedLiability(states[0].reserved[i], states[0].data[i], states[0].supply, options.fromTimestamp);
      const end = earnedLiability(states[1].reserved[i], states[1].data[i], states[1].supply, options.toTimestamp);
      const claims = paid.filter(log => log.token.toLowerCase() === token.toLowerCase()).reduce((sum, log) => sum + BigInt(log.amount), 0n);
      const accrued = end - start + claims;
      if (accrued < 0n) throw new Error('Negative StakedSYK accrual requires review');
      dailyHoldersRevenue.add(token, accrued.toString(), 'SYK Staker Reward Accrual');
    });
  }
  if (options.endTimestamp > distributorStart) {
    // The Merkle contract does not expose historical per-token allocation totals.
    // Count incremental successful claims, never cumulative claim arguments,
    // funding transfers, root replacements, or recoveries.
    const claims = await options.getLogs({ target: distributor, eventAbi: 'event Claimed(address indexed account,address indexed token,uint256 amount)' });
    for (const log of claims) {
      if (log.token.toLowerCase() === syk.toLowerCase()) continue;
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
  // docs.stryke.xyz/tokenomics/protocol-fees: rewards pool several products.
  // Associate this with the Stryke parent, NOT exclusively with its RFQ child.
  // Do not duplicate trading fees/revenue already recorded in stryke-rfq.
  methodology: {
    HoldersRevenue: 'Non-SYK rewards accrued by SYK stakers plus non-SYK rewards successfully claimed through the new sykASH distributor. Staking uses the change in earned reward liabilities plus claims; sykASH uses payment dates because historical allocation totals are not exposed. Covers these two new reward programs across products, not an estimated RFQ fee split. Excludes own-token emissions and unverified buybacks.',
  },
  breakdownMethodology: {
    HoldersRevenue: {
      'SYK Staker Reward Accrual': 'Change in rewardReserved minus unearned scheduled/idle rewards, plus paid claims. Active and zero-stake intervals follow StakedSYK accounting.',
      'sykASH Reward Claims': 'Incremental Claimed event amounts from the new Merkle distributor, excluding SYK. Funding and recoveries are not income.',
    },
  },
};
export default adapter;
