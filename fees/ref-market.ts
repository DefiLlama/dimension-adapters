import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json'

// Every ReferralEscrow deployment on Base mainnet that has settled or can still settle a claim.
const ESCROWS = [
  "0xa9f96c74230810205023c3E3AFEe33d3151e5Ee8", // first mainnet escrow, archived
  "0xA4bFddBc6Bb8F589a92A4d4595c6902e95eb9a38", // second, archived 2026-09-11
  "0xe9339BecfB1F6F4d0A031e7132fCf745CEb6611A", // live since 2026-09-11 (block 51164040)
];

// Emitted once per settled claim. feePaid is the protocol fee on a slot that paid out:
// 10% of the reward, charged to the referrer, and zero on a claim that did not pay.
const ClaimSettled =
  "event ClaimSettled(uint256 indexed claimId, uint256 indexed offerId, address indexed referee, address referrer, uint8 outcome, uint256 rewardPaid, uint256 feePaid, uint256 arbitrationPaid, uint256 refereeStakeReturned, uint256 referrerStakeReturned)";

const REFERRAL_PAYOUT_FEES = "Referral Payout Fees";
const REFERRAL_PAYOUT_FEES_TO_TREASURY = "Referral Payout Fees To Treasury";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({ targets: ESCROWS, eventAbi: ClaimSettled });
  logs.forEach((log: any) => dailyFees.add(ADDRESSES.base.USDC, log.feePaid, REFERRAL_PAYOUT_FEES));
  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(1, REFERRAL_PAYOUT_FEES_TO_TREASURY),
    dailyProtocolRevenue: dailyFees.clone(1, REFERRAL_PAYOUT_FEES_TO_TREASURY),
  };
};

const methodology = {
  Fees: "The protocol fee on every referral bounty that pays out: 10% of the reward, paid by the referrer.",
  Revenue: "All protocol fees (10% of referral rewards) go to the ref_market treasury.",
  ProtocolRevenue: "All protocol fees (10% of referral rewards) go to the ref_market treasury.",
};

const breakdownMethodology = {
  Fees: {
    [REFERRAL_PAYOUT_FEES]:
      "10% protocol fee on every referral bounty that pays out, charged to the referrer.",
  },
  Revenue: {
    [REFERRAL_PAYOUT_FEES_TO_TREASURY]: "All referral payout fees go to the ref_market treasury.",
  },
  ProtocolRevenue: {
    [REFERRAL_PAYOUT_FEES_TO_TREASURY]: "All referral payout fees go to the ref_market treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
