import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ABI, FEE_ESCROW, MEME_HOOK, REWARDS_FACTORY, REWARDS_FACTORY_START_BLOCK, START, scanLogs } from "./config";

/**
 * Fees are recognised at SETTLEMENT: every fee leg on Arc mainnet — curve trading fees, creator
 * tax, hook (post-graduation) fees after their memecoin part is converted to USDC, and curve
 * referral fees — lands in FociFeeEscrow through `CreditedToken`, in USDC. That gives one priced
 * event for the whole protocol. Sweeps are run by the keeper (curves whenever ≥1 USDC is pending,
 * pools at most every 6 h when ≥10 USDC is pending), so a day's fees are the day's sweeps, not the
 * day's trades. Hook referral fees are the one leg paid straight from the hook; they are counted when
 * claimed (`ReferralFeeClaimed`), in the currency paid.
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const chain = options.chain;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  // Who is who: the protocol's fee recipient (one address, read from the hook), and the
  // holder-reward distributors (a launch's creator fee recipient can be its distributor contract).
  const protocolRecipient = String(await options.api.call({ abi: ABI.protocolFeeRecipient, target: MEME_HOOK })).toLowerCase();
  const distributorLogs = await scanLogs({
    chain, target: REWARDS_FACTORY, eventAbi: ABI.distributorDeployed, fromBlock: REWARDS_FACTORY_START_BLOCK, toBlock, cacheInCloud: true,
  });
  const distributors = new Set<string>(distributorLogs.map((l: any) => String(l.distributor).toLowerCase()));

  const credits = await scanLogs({ chain, target: FEE_ESCROW, eventAbi: ABI.creditedToken, fromBlock, toBlock });
  for (const c of credits) {
    const recipient = String(c.recipient).toLowerCase();
    dailyFees.add(c.token, c.amount);
    if (recipient === protocolRecipient) dailyProtocolRevenue.add(c.token, c.amount);
    else if (distributors.has(recipient)) dailyHoldersRevenue.add(c.token, c.amount);
    else dailySupplySideRevenue.add(c.token, c.amount);
  }

  const referralClaims = await scanLogs({ chain, target: MEME_HOOK, eventAbi: ABI.referralFeeClaimed, fromBlock, toBlock });
  for (const r of referralClaims) {
    dailyFees.add(r.currency, r.amount);
    dailySupplySideRevenue.add(r.currency, r.amount);
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

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARC],
  start: START,
  methodology,
};

export default adapter;
