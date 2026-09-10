import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Base USDC, the only asset the escrow settles in.
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Every ReferralEscrow deployment on Base mainnet that has settled or can still settle a claim.
const ESCROWS = [
  "0xa9f96c74230810205023c3E3AFEe33d3151e5Ee8", // first mainnet escrow, archived
  "0xA4bFddBc6Bb8F589a92A4d4595c6902e95eb9a38", // live
];

// Emitted once per settled claim. feePaid is the protocol fee on a slot that paid out:
// 10% of the reward, charged to the referrer, and zero on a claim that did not pay.
const ClaimSettled =
  "event ClaimSettled(uint256 indexed claimId, uint256 indexed offerId, address indexed referee, address referrer, uint8 outcome, uint256 rewardPaid, uint256 feePaid, uint256 arbitrationPaid, uint256 refereeStakeReturned, uint256 referrerStakeReturned)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const logs = await options.getLogs({ targets: ESCROWS, eventAbi: ClaimSettled });
  logs.forEach((log: any) => dailyFees.add(USDC, log.feePaid));
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "The protocol fee on every referral bounty that pays out: 10% of the reward, paid by the referrer.",
  Revenue: "All protocol fees go to the ref_market treasury.",
  ProtocolRevenue: "All protocol fees go to the ref_market treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-09-08",
  methodology,
};

export default adapter;
