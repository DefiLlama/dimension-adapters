import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// sFLR (StakedFlr proxy), verified source:
// https://flare-explorer.flare.network/address/0x12e605bc104e93b45e1ad99f9e555f659051c2bb
const SFLR = ADDRESSES.flare.sFLR;

// Emitted on every accrual into the sFLR pool. userRewardAmount is added to totalPooledFlr
// (raises the sFLR/FLR rate for holders), protocolRewardAmount is sent to
// protocolRewardShareRecipient. protocolRewardShare has been 10% (1e17) since it was set
// at block 25005251 on 2024-06-05, before the first accrual, and was never changed;
// docs: "90% of those rewards are deposited into the sFLR pool and 10% is the fee for the protocol"
// https://romeblockchain.gitbook.io/sceptre-liquid-staking-documentation/guides/rewards-in-sceptre
const ACCRUE_REWARDS_EVENT = 'event AccrueRewards(uint256 userRewardAmount, uint256 protocolRewardAmount)';

// Emitted next to AccrueRewards (same tx) since the 2024-11-01 upgrade, with the reward
// source. rewardType 5 = buy-in staking fees: a deposit fee collected from new stakers and
// later added to the pool with protocolRewardAmount = 0 (disableBuyInStaking). Types 0-4 are
// FlareDrops, P-chain staking and C-chain delegation rewards.
const ACCRUE_REWARDS_EXT_EVENT = 'event AccrueRewardsExt(uint256 userRewardAmount, uint256 protocolRewardAmount, uint8 indexed rewardType)';
const REWARD_TYPE_BUYIN_STAKING_FEES = 5;

// Instant redeem (since 2026-03): feeAmount stays in the pool, so it accrues to sFLR holders.
const INSTANT_REDEEM_EVENT = 'event InstantRedeem(address indexed user, uint256 sFlrBurned, uint256 grossWflrOut, uint256 netWflrOut, uint256 feeAmount)';

const LABELS = {
  STAKING_REWARDS: 'Staking Rewards',
  BUYIN_FEES: 'Buy-In Staking Fees',
  INSTANT_REDEEM_FEES: 'Instant Redeem Fees',
  STAKING_REWARDS_TO_HOLDERS: 'Staking Rewards To sFLR Holders',
  BUYIN_FEES_TO_HOLDERS: 'Buy-In Staking Fees To sFLR Holders',
  INSTANT_REDEEM_FEES_TO_HOLDERS: 'Instant Redeem Fees To sFLR Holders',
  STAKING_REWARDS_TO_PROTOCOL: 'Staking Rewards To Protocol',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [accrueLogs, accrueExtLogs, instantRedeemLogs] = await Promise.all([
    options.getLogs({ target: SFLR, eventAbi: ACCRUE_REWARDS_EVENT, onlyArgs: false }),
    options.getLogs({ target: SFLR, eventAbi: ACCRUE_REWARDS_EXT_EVENT, onlyArgs: false }),
    options.getLogs({ target: SFLR, eventAbi: INSTANT_REDEEM_EVENT }),
  ]);

  const addAccrual = (userReward: bigint, protocolReward: bigint, isBuyIn: boolean) => {
    if (isBuyIn) {
      dailyFees.addGasToken(userReward + protocolReward, LABELS.BUYIN_FEES);
      dailySupplySideRevenue.addGasToken(userReward, LABELS.BUYIN_FEES_TO_HOLDERS);
    } else {
      dailyFees.addGasToken(userReward + protocolReward, LABELS.STAKING_REWARDS);
      dailySupplySideRevenue.addGasToken(userReward, LABELS.STAKING_REWARDS_TO_HOLDERS);
    }
    // buy-in fees are always added with protocolRewardAmount = 0
    if (protocolReward > 0n) dailyRevenue.addGasToken(protocolReward, LABELS.STAKING_REWARDS_TO_PROTOCOL);
  };

  // AccrueRewardsExt carries the reward source; older accruals only emit AccrueRewards
  const extTxs = new Set<string>();
  for (const log of accrueExtLogs) {
    extTxs.add(log.transactionHash);
    addAccrual(BigInt(log.args.userRewardAmount), BigInt(log.args.protocolRewardAmount), Number(log.args.rewardType) === REWARD_TYPE_BUYIN_STAKING_FEES);
  }
  for (const log of accrueLogs) {
    if (extTxs.has(log.transactionHash)) continue;
    addAccrual(BigInt(log.args.userRewardAmount), BigInt(log.args.protocolRewardAmount), false);
  }

  for (const log of instantRedeemLogs) {
    dailyFees.addGasToken(log.feeAmount, LABELS.INSTANT_REDEEM_FEES);
    dailySupplySideRevenue.addGasToken(log.feeAmount, LABELS.INSTANT_REDEEM_FEES_TO_HOLDERS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'All FLR rewards earned by FLR staked through Sceptre (P-chain staking, delegation rewards and FlareDrops), plus buy-in staking fees and instant redeem fees paid by sFLR users.',
  Revenue: 'The 10% fee Sceptre takes from staking rewards.',
  ProtocolRevenue: 'The 10% fee Sceptre takes from staking rewards, sent to the protocol fee recipient.',
  SupplySideRevenue: 'The 90% of staking rewards added to the sFLR pool, plus buy-in staking fees and instant redeem fees left in the pool, all accruing to sFLR holders through the sFLR/FLR exchange rate.',
};

const breakdownMethodology = {
  Fees: {
    [LABELS.STAKING_REWARDS]: 'FLR rewards from P-chain staking, delegation and FlareDrops accrued to the sFLR contract, before the protocol fee.',
    [LABELS.BUYIN_FEES]: 'Buy-in staking fee charged on sFLR deposits, added to the pool for existing holders.',
    [LABELS.INSTANT_REDEEM_FEES]: 'Fee charged when sFLR is redeemed instantly for WFLR instead of waiting for the unlock period.',
  },
  Revenue: {
    [LABELS.STAKING_REWARDS_TO_PROTOCOL]: '10% of staking rewards sent to the Sceptre protocol fee recipient.',
  },
  ProtocolRevenue: {
    [LABELS.STAKING_REWARDS_TO_PROTOCOL]: '10% of staking rewards sent to the Sceptre protocol fee recipient.',
  },
  SupplySideRevenue: {
    [LABELS.STAKING_REWARDS_TO_HOLDERS]: '90% of staking rewards added to the sFLR pool for holders.',
    [LABELS.BUYIN_FEES_TO_HOLDERS]: 'Buy-in staking fees added to the sFLR pool for holders.',
    [LABELS.INSTANT_REDEEM_FEES_TO_HOLDERS]: 'Instant redeem fees kept in the sFLR pool for the remaining holders.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.FLARE],
  start: '2024-05-08', // sFLR proxy creation: https://flare-explorer.flare.network/tx/0x623921bd1f67ac9183faa3d00499df830984943bea5fd857c8b27f1cff421f17
  methodology,
  breakdownMethodology,
};

export default adapter;
