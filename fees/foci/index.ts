import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Foci — token launchpad on Arc. Contracts: https://github.com/yonzaynator/foci
const FEE_ESCROW = "0x5a76a44B49ca0f7c4dB181f289C1eCA91d928406"; // FociFeeEscrow
const MEME_HOOK = "0xF847790B6fA5DA300BB3f56f10d743e71E98e044"; // FociMemeHook (V4 hook)
const REWARDS_FACTORY = "0xdac447110867954F00638125bbd5c66D8E0a7195"; // FociRewardsDistributorFactory
const REWARDS_FACTORY_START_BLOCK = 21075146; // 2026-09-15

const SWAP_FEES_TO_PROTOCOL = "Token Swap Fees to Protocol";
const SWAP_FEES_TO_HOLDERS = "Token Swap Fees to Holders";
const REFERRAL_FEES = "Referral Fees";
const REFERRAL_FEES_TO_REFERRERS = "Referral Fees to Referrers";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Who is who: the protocol's fee recipient (one address, read from the hook), and the
  // holder-reward distributors (a launch's creator fee recipient can be its distributor contract).
  const protocolRecipient = String(await options.api.call({ abi: "address:protocolFeeRecipient", target: MEME_HOOK })).toLowerCase();
  const distributorLogs = await options.getLogs({
    target: REWARDS_FACTORY,
    eventAbi: "event DistributorDeployed(address indexed token, address indexed distributor, address indexed creator, address pairToken, bytes32 salt)",
    fromBlock: REWARDS_FACTORY_START_BLOCK,
    cacheInCloud: true,
  });
  const distributors = new Set<string>(distributorLogs.map((l: any) => String(l.distributor).toLowerCase()));

  const credits = await options.getLogs({
    target: FEE_ESCROW,
    eventAbi: "event CreditedToken(address indexed recipient, address indexed token, address indexed depositor, uint256 amount)",
  });
  for (const c of credits) {
    const recipient = String(c.recipient).toLowerCase();
    dailyFees.add(c.token, c.amount, METRIC.SWAP_FEES);
    if (recipient === protocolRecipient) dailyProtocolRevenue.add(c.token, c.amount, SWAP_FEES_TO_PROTOCOL);
    else if (distributors.has(recipient)) dailyHoldersRevenue.add(c.token, c.amount, SWAP_FEES_TO_HOLDERS);
    else dailySupplySideRevenue.add(c.token, c.amount, METRIC.CREATOR_FEES);
  }

  const referralClaims = await options.getLogs({
    target: MEME_HOOK,
    eventAbi: "event ReferralFeeClaimed(address indexed referrer, address indexed currency, uint256 amount)",
  });
  for (const r of referralClaims) {
    dailyFees.add(r.currency, r.amount, REFERRAL_FEES);
    dailySupplySideRevenue.add(r.currency, r.amount, REFERRAL_FEES_TO_REFERRERS);
  }
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "All trading fees settled into FociFeeEscrow during the day (curve fees, creator tax, converted post-graduation hook fees, curve referral fees), plus hook referral fees claimed that day. Recognised when swept by the keeper, not when traded.",
  UserFees: "Same as Fees: every fee is paid by traders on buys and sells.",
  Revenue: "Protocol fee recipient's share plus the share paid to holder-reward distributors.",
  ProtocolRevenue: "Escrow credits to the protocol fee recipient (the protocol's frozen share of each launch's trading fee).",
  HoldersRevenue: "Escrow credits to FociRewardsDistributor contracts — launches that elected to pay their creator share to token holders.",
  SupplySideRevenue: "Escrow credits to creators (their fee share and the creator tax) and to referrers, plus hook referral claims.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees settled into FociFeeEscrow (curve fees, creator tax, converted post-graduation hook fees, and curve referral fees). Recognised when the keeper sweeps, not when traded.",
    [REFERRAL_FEES]: "Hook referral fees claimed that day via ReferralFeeClaimed on FociMemeHook.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Same escrow-settled trading fees; paid by traders on buys and sells.",
    [REFERRAL_FEES]: "Same hook referral fees; paid by traders on buys and sells.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Escrow credits to the protocol fee recipient.",
    [SWAP_FEES_TO_HOLDERS]: "Escrow credits to FociRewardsDistributor contracts.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's frozen share of each launch's trading fee, credited to the protocol fee recipient.",
  },
  HoldersRevenue: {
    [SWAP_FEES_TO_HOLDERS]: "Creator-share credits redirected to FociRewardsDistributor contracts for launches that pay token holders.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "Escrow credits to creators (their fee share and the creator tax) and to curve referrers.",
    [REFERRAL_FEES_TO_REFERRERS]: "Hook referral fees claimed by referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-14",
  methodology,
  breakdownMethodology,
  doublecounted: true, // uni-v4
};

export default adapter;
