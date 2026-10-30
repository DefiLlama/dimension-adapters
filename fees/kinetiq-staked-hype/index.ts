import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const METRICS = {
  StakingRewards: 'kHYPE Staking Rewards',
  StakingRewardsToLPs: 'kHYPE Staking Rewards To Stakers',
  PerformanceFees: 'kHYPE Performance Fees',
  UnstakingFees: 'kHYPE Unstaking Fees',
  InstantUnstakeFees: 'kHYPE Instant Unstake Fees',
  InstantUnstakeFeesToStakers: 'kHYPE Instant Unstake Fees To Stakers',
  InstantUnstakeFeesToTreasury: 'kHYPE Instant Unstake Fees To Treasury',
  TokenByBack: 'Token Buy Back',
}

const methodology = {
  Fees: 'Staking rewards earned by staked HYPE, plus the 0.1% kHYPE unstaking fee (charged until 2026-04-07) and the instant-unstake fee (charged since 2026-05-05).',
  Revenue: 'The 0.1% kHYPE unstaking fee (charged until 2026-04-07, counted when the treasury receives it at withdrawal confirmation); since KIP-2 (2026-04-08) also the 10% performance fee on staking rewards and the treasury share of instant-unstake fees.',
  ProtocolRevenue: 'The 0.1% kHYPE unstaking fee (charged until 2026-04-07, counted when the treasury receives it at withdrawal confirmation); since KIP-2 (2026-04-08) also the 30% of the performance fee paid to the treasury and the treasury share of instant-unstake fees.',
  SupplySideRevenue: 'Staking rewards left to kHYPE holders (all of them before KIP-2 on 2026-04-08, 90% since), plus the share of instant-unstake fees burned in favour of kHYPE holders.',
  HoldersRevenue: 'Since KIP-2 (2026-04-08), the 70% of the performance fee (itself 10% of staking rewards) paid to the KNTQ buyback wallet. The bought KNTQ went to sKNTQ stakers until 2026-09-15 and has been sent to the Hyperliquid Assistance Fund since then (KIP-5, https://kinetiq.xyz/blog/kip-5-kntq-buybacks-assistance-fund).',
};

const breakdownMethodology = {
  Fees: {
    [METRICS.StakingRewards]: 'Staking rewards earned by staked HYPE; since KIP-2, grossed up by rewardShareBps from the performance fee the RewardShareTracker records for each validator reward.',
    [METRICS.UnstakingFees]: '0.1% fee on kHYPE unstaking, charged until 2026-04-07 and counted when the treasury receives it at withdrawal confirmation.',
    [METRICS.InstantUnstakeFees]: 'Fee on instant unstakes, charged since 2026-05-05 at the feeRateBps logged with each one: 0.2% on the first 8 instant unstakes (2026-05-05 and 2026-05-06), 0.1% since.',
  },
  SupplySideRevenue: {
    [METRICS.StakingRewardsToLPs]: 'Staking rewards left to kHYPE holders: all of them before KIP-2, 90% since.',
    [METRICS.InstantUnstakeFeesToStakers]: 'The part of each instant-unstake fee that is burned, raising the kHYPE exchange rate for its holders.',
  },
  Revenue: {
    [METRICS.UnstakingFees]: '0.1% fee on kHYPE unstaking, charged until 2026-04-07 and counted when the treasury receives it at withdrawal confirmation.',
    [METRICS.PerformanceFees]: 'Since KIP-2, the 10% performance fee Kinetiq takes from staking rewards.',
    [METRICS.InstantUnstakeFeesToTreasury]: 'The part of each instant-unstake fee sent to the Kinetiq treasury.',
  },
  ProtocolRevenue: {
    [METRICS.UnstakingFees]: '0.1% fee on kHYPE unstaking, charged until 2026-04-07 and counted when the treasury receives it at withdrawal confirmation.',
    [METRICS.PerformanceFees]: 'Since KIP-2, the 30% of the performance fee paid to the Kinetiq treasury.',
    [METRICS.InstantUnstakeFeesToTreasury]: 'The part of each instant-unstake fee sent to the Kinetiq treasury.',
  },
  HoldersRevenue: {
    [METRICS.TokenByBack]: 'Since KIP-2, the 70% of the performance fee paid to the KNTQ buyback wallet; the bought KNTQ went to sKNTQ stakers until 2026-09-15 and to the Hyperliquid Assistance Fund since then (KIP-5).',
  }
};

const KHYPE = '0xfD739d4e423301CE9385c1fb8850539D657C296D';
const KHYPE_STAKING_ACCOUNTANT = '0x9209648Ec9D448EF57116B73A2f081835643dc7A';
const KHYPE_TREASURY = '0x64bD77698Ab7C3Fd0a1F54497b228ED7a02098E3'; // treasuryWallet() of the tracker, treasury() of the StakingManager
// StakingManager (https://sourcify.dev/server/v2/contract/999/0x23fda3b9f944dbeaf2dcd5e7b9f8207b102c933f); emits InstantUnstakeExecuted
const KHYPE_STAKING_MANAGER = '0x393D0B87Ed38fc779FD9611144aE649BA6082109';
// RewardShareTracker (https://sourcify.dev/server/v2/contract/999/0x01ad7c427459f48e76b3dc48e08aa59c990080d5): each reward's
// rewardShare = deployerAmount (via 0x55758d720e0f32328f7f1e1b3de6b637e0bec4ba to buyback wallet 0xaa3b7392052d62928cc87701e3ca6fb6630bb6e2)
// + treasuryAmount (to KHYPE_TREASURY)
const KHYPE_REWARD_SHARE_TRACKER = '0xE5FbA07C7b3CfbC29633f3D3Ab38b36007F35983';
// KIP-2 (https://x.com/Kinetiq_xyz/status/2041888848595021866): first RewardDistributionQueued, block 31907253
const KIP2_START = 1775638820; // 2026-04-08 09:00:20 UTC
const exchangeRateAbi = 'function kHYPEToHYPE(uint256 kHYPEAmount) external view returns (uint256)'
const rewardDistributionQueuedAbi = 'event RewardDistributionQueued(uint256 indexed distributionId, address indexed validator, uint256 newRewardAmount, uint256 rewardShare, uint256 deployerAmount, uint256 treasuryAmount)';
const instantUnstakeExecutedAbi = 'event InstantUnstakeExecuted(address indexed user, uint256 kHYPEAmount, uint256 hypeReceived, uint256 kHYPEFee, uint256 feeRateBps, uint256 kHYPEFeeBurned, uint256 kHYPEFeeToTreasury)';
const transferAbi = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (options.toTimestamp <= KIP2_START) {
    const exchangeRateBefore = await options.fromApi.call({
      target: KHYPE_STAKING_ACCOUNTANT,
      abi: exchangeRateAbi,
      params: ['1000000000000000000'],
    }) / 1e18;
    const exchangeRateAfter = await options.toApi.call({
      target: KHYPE_STAKING_ACCOUNTANT,
      abi: exchangeRateAbi,
      params: ['1000000000000000000'],
    }) / 1e18;

    const totalSupply = await options.api.call({
      target: KHYPE,
      abi: 'uint256:totalSupply',
    }) / 1e18;

    dailyFees.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore), METRICS.StakingRewards);
    dailySupplySideRevenue.addCGToken('hyperliquid', totalSupply * (exchangeRateAfter - exchangeRateBefore), METRICS.StakingRewardsToLPs);

    // StakingManager only: 8,364.6 kHYPE from 0x68ec1fdd4bb202b2e07ae751cb5553644aa48cfa is not a fee
    // (e.g. tx 0xf36b32481b141bcb4eb502309795fe6f5419f9c358067a3f060832755efea2c7)
    const unstakingFees = await addTokensReceived({
      options,
      token: KHYPE,
      target: KHYPE_TREASURY,
      fromAddressFilter: KHYPE_STAKING_MANAGER,
    });
    dailyFees.addBalances(unstakingFees, METRICS.UnstakingFees)
    dailyRevenue.addBalances(unstakingFees, METRICS.UnstakingFees)
    dailyProtocolRevenue.addBalances(unstakingFees, METRICS.UnstakingFees)
  } else {
    // Events, not exchange-rate growth: burning queued withdrawals at their request-time price counts their yield twice (+3.75%)
    const [distributions, instantUnstakes, stakingManagerToTreasury, rewardShareBps] = await Promise.all([
      options.getLogs({ target: KHYPE_REWARD_SHARE_TRACKER, eventAbi: rewardDistributionQueuedAbi }),
      options.getLogs({ target: KHYPE_STAKING_MANAGER, eventAbi: instantUnstakeExecutedAbi, entireLog: true, parseLog: true }),
      options.getLogs({
        target: KHYPE, eventAbi: transferAbi, topics: [TRANSFER_TOPIC, pad(KHYPE_STAKING_MANAGER), pad(KHYPE_TREASURY)],
        entireLog: true, parseLog: true,
      }),
      options.api.call({ target: KHYPE_REWARD_SHARE_TRACKER, abi: 'uint256:rewardShareBps' }),
    ]);

    for (const { rewardShare, deployerAmount, treasuryAmount } of distributions) {
      // no gross amount in the log (newRewardAmount == rewardShare): gross up by rewardShareBps
      const performanceFees = Number(rewardShare) / 1e18;
      const stakingRewards = performanceFees * 10000 / Number(rewardShareBps);
      dailyFees.addCGToken('hyperliquid', stakingRewards, METRICS.StakingRewards);
      dailySupplySideRevenue.addCGToken('hyperliquid', stakingRewards - performanceFees, METRICS.StakingRewardsToLPs);
      dailyRevenue.addCGToken('hyperliquid', performanceFees, METRICS.PerformanceFees);
      dailyProtocolRevenue.addCGToken('hyperliquid', Number(treasuryAmount) / 1e18, METRICS.PerformanceFees);
      dailyHoldersRevenue.addCGToken('hyperliquid', Number(deployerAmount) / 1e18, METRICS.TokenByBack);
    }

    // kHYPEFee = kHYPEFeeBurned (to kHYPE holders) + kHYPEFeeToTreasury
    for (const { args: { kHYPEFee, kHYPEFeeBurned, kHYPEFeeToTreasury } } of instantUnstakes) {
      dailyFees.add(KHYPE, kHYPEFee, METRICS.InstantUnstakeFees);
      dailySupplySideRevenue.add(KHYPE, kHYPEFeeBurned, METRICS.InstantUnstakeFeesToStakers);
      dailyRevenue.add(KHYPE, kHYPEFeeToTreasury, METRICS.InstantUnstakeFeesToTreasury);
      dailyProtocolRevenue.add(KHYPE, kHYPEFeeToTreasury, METRICS.InstantUnstakeFeesToTreasury);
    }

    // 0.1% unstaking fee (charged until 2026-04-07) reaches the treasury at withdrawal confirmation; counted on receipt,
    // net of each tx's kHYPEFeeToTreasury (all history: 32,098 kHYPE vs 32,105 kHYPE WithdrawalQueued feeAmount)
    const received: Record<string, bigint> = {};
    for (const log of stakingManagerToTreasury) {
      const tx = String(log.transactionHash).toLowerCase();
      received[tx] = (received[tx] ?? 0n) + BigInt(log.args.value);
    }
    for (const log of instantUnstakes) {
      const tx = String(log.transactionHash).toLowerCase();
      received[tx] = (received[tx] ?? 0n) - BigInt(log.args.kHYPEFeeToTreasury);
    }
    for (const amount of Object.values(received)) {
      if (amount <= 0n) continue;
      dailyFees.add(KHYPE, amount.toString(), METRICS.UnstakingFees);
      dailyRevenue.add(KHYPE, amount.toString(), METRICS.UnstakingFees);
      dailyProtocolRevenue.add(KHYPE, amount.toString(), METRICS.UnstakingFees);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-07-14',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
