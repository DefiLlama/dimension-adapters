import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Snuggle keeps 15% of what the positions it manages earn: https://www.snuggle.fi/docs
const TREASURY_ABI = "address:treasury";
const STAKING_MANAGER_ABI = "address:stakingManager";
const REFERRAL_TRACKER_ABI = "address:referralTracker";
// referrer's share, trading fees
const REFERRAL_EARNED_EVENT = "event EarningsRecorded(address indexed referrer, address indexed token, uint256 amount, uint256 totalEarnings)";
// referrer's share, staking rewards, these never reach the tracker
const REWARD_FEE_EVENT = "event PerformanceFeeCollected(uint256 indexed tokenId, address indexed token, uint256 feeAmount, uint256 treasuryAmount, uint256 referralAmount)";
// a failed referral payment goes to the treasury but is still reported as a referral
const REFERRAL_FAILED_EVENT = "event ReferralPaymentFailed(address indexed referrer, address indexed token, uint256 amount)";
// 1500 today, read per period because the owner can change it
const PERFORMANCE_FEE_ABI = "uint256:performanceFeeBps";
const BPS_DENOMINATOR = 10000;

const METRIC = {
  LP_FEES: "Liquidity Position Fees",
  TO_DEPOSITORS: "Position Fees To Depositors",
  TO_TREASURY: "Performance Fee To Treasury",
  TO_REFERRERS: "Performance Fee To Referrers",
}

// same vaults the tvl adapter reads, maxfi is a snuggle whitelabel counted with it there too
const chainConfig: Record<string, { vaults: string[], start: string }> = {
  [CHAIN.BASE]: {
    vaults: [
      "0xd3923beccb6e1ddb048ed00a0a9bd602d16b7470", // Snuggle
      "0x7d27cdfbfcc878f7e7349e216d44204bfd2afd55", // MaxFi
    ],
    start: "2026-02-14",
  },
  [CHAIN.ARBITRUM]: {
    vaults: ["0x413Ca90D38D964546c2fE03cB103df57372630F6"],
    start: "2026-02-27",
  },
  [CHAIN.ROBINHOOD]: {
    vaults: ["0x1195C074F898b7644bA732407619c9804dFE6DCE"], // MaxFi
    start: "2026-07-25",
  },
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { vaults } = chainConfig[options.chain];

  const treasuries = await options.api.multiCall({ abi: TREASURY_ABI, calls: vaults });
  const feeBps = await options.api.multiCall({ abi: PERFORMANCE_FEE_ABI, calls: vaults });
  const stakingManagers = await options.api.multiCall({ abi: STAKING_MANAGER_ABI, calls: vaults });
  const trackers = await options.api.multiCall({ abi: REFERRAL_TRACKER_ABI, calls: stakingManagers });

  const referralLogs = await options.getLogs({ targets: trackers, eventAbi: REFERRAL_EARNED_EVENT, flatten: false });
  const rewardLogs = await options.getLogs({ targets: vaults, eventAbi: REWARD_FEE_EVENT, flatten: false });
  const failedLogs = await options.getLogs({ targets: vaults, eventAbi: REFERRAL_FAILED_EVENT, flatten: false });

  for (const [i, vault] of vaults.entries()) {
    // the cut is split between the treasury and the owner's referrer, both sides make up the fee
    const toTreasury = await addTokensReceived({ options, target: treasuries[i], fromAddressFilter: vault });
    const toReferrers = options.createBalances();
    referralLogs[i].forEach((log: any) => toReferrers.add(log.token, log.amount));
    rewardLogs[i].forEach((log: any) => toReferrers.add(log.token, log.referralAmount));
    // already counted as a treasury transfer
    failedLogs[i].forEach((log: any) => toReferrers.add(log.token, -log.amount));

    const cut = options.createBalances();
    cut.addBalances(toTreasury);
    cut.addBalances(toReferrers);

    // scale the cut back up to what the position earned, the rest stayed with the depositor
    const earnedRatio = BPS_DENOMINATOR / Number(feeBps[i]);

    dailyFees.addBalances(cut.clone(earnedRatio, METRIC.LP_FEES));
    dailyRevenue.addBalances(toTreasury.clone(1, METRIC.TO_TREASURY));
    dailySupplySideRevenue.addBalances(toReferrers.clone(1, METRIC.TO_REFERRERS));
    dailySupplySideRevenue.addBalances(cut.clone(earnedRatio - 1, METRIC.TO_DEPOSITORS));
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "Trading fees and staking rewards earned by the concentrated liquidity positions the vaults manage, scaled up from the performance fee the vault moved to its treasury.",
  Revenue: "The share of the 15% performance fee that lands in the vault treasury. The part paid out to a position owner's referrer is counted as supply side instead.",
  ProtocolRevenue: "All revenue goes to the vault treasury.",
  SupplySideRevenue: "The rest of the position's earnings, which stay with the depositor, plus the referral share paid out of the performance fee.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Trading fees and staking rewards the managed positions earned before the performance fee was taken.",
  },
  Revenue: {
    [METRIC.TO_TREASURY]: "Performance fee received by the vault treasury.",
  },
  ProtocolRevenue: {
    [METRIC.TO_TREASURY]: "Performance fee received by the vault treasury.",
  },
  SupplySideRevenue: {
    [METRIC.TO_DEPOSITORS]: "Position earnings left with the depositors after the performance fee.",
    [METRIC.TO_REFERRERS]: "Share of the performance fee paid out to the position owner's referrer.",
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // the pools are uniswap v3, aerodrome, pancakeswap, sushiswap and camelot
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;
