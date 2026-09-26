import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// FWAV2, rewards module (builder rewards) and FWAV2Buyback, all verified on Blockscout
const FWA_V2 = "0x958C41181182e76F221331b2755b77D9e1426A98";
const REWARDS = "0xA54b44C7a894AA19C49734A753D01f9B8C5f6516";
const BUYBACK = "0xaba91665cdf921F0f6B33A099337336B324c9793";

const METRICS = {
  AcquisitionFees: 'Acquisition Fees',
  SettlementFees: 'Settlement Fees',
  RetainedSettlements: 'Retained Settlement Penalties',
  EarlyCrownExitFees: 'Early Crown Exit Fees',
  TopListingReward: 'Top Listing Reward',
  BuilderRewards: 'Builder Rewards',
  BuybackRewardsToDepositors: 'FWA Rewards To Depositors',
  BuybackRewardsToPurchasers: 'FWA Rewards To Purchasers',
  BuybackCallerIncentive: 'Buyback Caller Incentive',
  TokenBuyBackAndBurn: 'Token Buy Back And Burn',
  FeePayoutsToTeam: 'Fee Payouts To Team',
};

const ABIS = {
  OwnerFeesAccrued: "event OwnerFeesAccrued(uint256 amount)",
  EarningsAccrued: "event EarningsAccrued(address indexed depositor, uint256 indexed listingId, uint256 amount)",
  TopListingFunded: "event TopListingFunded(uint256 indexed listingId, uint256 amount, uint256 newPot)",
  DepositorBidAccepted: "event DepositorBidAccepted(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 payout, uint256 retained)",
  DepositorBidAcceptedAsTokens: "event DepositorBidAcceptedAsTokens(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 ethPayout, uint256 retained, uint256 tokenOut)",
  AcquisitionRequested: "event AcquisitionRequested(uint256 indexed requestId, address indexed purchaser, uint256 acquisitionFee, uint256 totalWeight)",
  NFTAllocated: "event NFTAllocated(uint256 indexed requestId, uint256 indexed listingId, address indexed purchaser, address depositor, uint256 value, uint256 randomWord)",
  EarlyCrownExitFee: "event EarlyCrownExitFee(uint256 indexed listingId, address indexed depositor, uint256 grossBacking, uint256 fee)",
  FeesPaidOut: "event FeesPaidOut(address indexed to, uint256 amount)",
  Bought: "event Bought(address indexed caller, uint256 ethSpent, uint256 tokensBought, uint256 callerReward, uint256 depositorTokens, uint256 purchaserTokens, uint256 burnedTokens)",
  // last field is `slice` in the source, renamed because it clashes with Array.slice on decoded args
  AcquisitionTokenAccrued: "event AcquisitionTokenAccrued(address indexed caller, uint256 indexed requestId, uint256 builderSlice)",
  SettlementBuilderRewardAccrued: "event SettlementBuilderRewardAccrued(uint256 indexed listingId, address indexed caller, uint256 protocolFee, uint256 builderSlice)",
};

const sum = (logs: any[], key: string) => logs.reduce((acc, log) => acc + BigInt(log[key]), 0n);

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [
    ownerFees, earnings, topListingFunded, bidAccepted, bidAcceptedAsTokens, allocated,
    crownExits, acquisitionRewards, settlementRewards, teamPayouts, buybacks,
  ] = await Promise.all([
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.OwnerFeesAccrued }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.EarningsAccrued }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.TopListingFunded }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.DepositorBidAccepted }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.DepositorBidAcceptedAsTokens }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.NFTAllocated }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.EarlyCrownExitFee }),
    options.getLogs({ target: REWARDS, eventAbi: ABIS.AcquisitionTokenAccrued }),
    options.getLogs({ target: REWARDS, eventAbi: ABIS.SettlementBuilderRewardAccrued }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.FeesPaidOut }),
    options.getLogs({ target: BUYBACK, eventAbi: ABIS.Bought }),
  ]);

  // Volume: price of each pull, counted when it settles; the request can be up to ~1 day older
  const requested = await options.getLogs({
    target: FWA_V2,
    eventAbi: ABIS.AcquisitionRequested,
    fromBlock: Number(await options.getFromBlock()) - 7_200,
  });
  const feeByRequest = new Map<string, bigint>();
  requested.forEach((log: any) => feeByRequest.set(String(log.requestId), BigInt(log.acquisitionFee)));
  allocated.forEach((log: any) => {
    const fee = feeByRequest.get(String(log.requestId));
    if (fee === undefined) throw new Error(`FWA V2: no AcquisitionRequested log for request ${log.requestId}`);
    dailyVolume.addGasToken(fee);
  });

  // Quick-sell payouts to purchasers are netted out of acquisition fees and depositor earnings
  const quickSellPayouts = sum(bidAccepted, 'payout') + sum(bidAcceptedAsTokens, 'ethPayout');
  dailyFees.addGasToken(-quickSellPayouts, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(-quickSellPayouts, METRICS.AcquisitionFees);

  const depositorEarnings = sum(earnings, 'amount');
  dailyFees.addGasToken(depositorEarnings, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(depositorEarnings, METRICS.AcquisitionFees);
  const topListingRewards = sum(topListingFunded, 'amount');
  dailyFees.addGasToken(topListingRewards, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(topListingRewards, METRICS.TopListingReward);

  // Protocol fee of each final settlement, gross of the builder share
  const retainedListings = new Set(bidAccepted.concat(bidAcceptedAsTokens).map((log: any) => String(log.listingId)));
  const settlement = { fee: 0n, builderShare: 0n };
  const retained = { fee: 0n, builderShare: 0n };
  settlementRewards.forEach((log: any) => {
    const bucket = retainedListings.has(String(log.listingId)) ? retained : settlement;
    bucket.fee += BigInt(log.protocolFee);
    bucket.builderShare += BigInt(log.builderSlice);
  });
  const crownExit = { fee: sum(crownExits, 'fee'), builderShare: 0n };

  // OwnerFeesAccrued is the protocol's total take net of builder rewards; the acquisition cut is what remains
  // after the settlement-side fees. All legs are emitted in the same tx, so a negative residual means missing logs
  const acquisitionBuilderShare = sum(acquisitionRewards, 'builderSlice');
  const acquisition = {
    fee: sum(ownerFees, 'amount') + acquisitionBuilderShare + settlement.builderShare + retained.builderShare
      - settlement.fee - retained.fee - crownExit.fee,
    builderShare: acquisitionBuilderShare,
  };
  if (acquisition.fee < 0n) throw new Error(`FWA V2: owner fee accruals below the settlement-side fees (${acquisition.fee}), incomplete logs`);

  const protocolFees: [{ fee: bigint, builderShare: bigint }, string][] = [
    [acquisition, METRICS.AcquisitionFees],
    [settlement, METRICS.SettlementFees],
    [retained, METRICS.RetainedSettlements],
    [crownExit, METRICS.EarlyCrownExitFees],
  ];
  protocolFees.forEach(([{ fee, builderShare }, label]) => {
    dailyFees.addGasToken(fee, label);
    dailySupplySideRevenue.addGasToken(builderShare, METRICS.BuilderRewards);
    dailyRevenue.addGasToken(fee - builderShare, label);
  });

  // Booked when executed: team payouts, and buybacks, whose FWA rewards and caller incentive go to users
  // (moved from revenue to supply side) and whose burn goes to holders
  dailyProtocolRevenue.addGasToken(sum(teamPayouts, 'amount'), METRICS.FeePayoutsToTeam);
  buybacks.forEach((log: any) => {
    const ethSpent = BigInt(log.ethSpent);
    const toDepositors = ethSpent * BigInt(log.depositorTokens) / BigInt(log.tokensBought);
    const toPurchasers = ethSpent * BigInt(log.purchaserTokens) / BigInt(log.tokensBought);
    const rewards: [bigint, string][] = [
      [toDepositors, METRICS.BuybackRewardsToDepositors],
      [toPurchasers, METRICS.BuybackRewardsToPurchasers],
      [BigInt(log.callerReward), METRICS.BuybackCallerIncentive],
    ];
    rewards.forEach(([amount, label]) => {
      dailyRevenue.addGasToken(-amount, label);
      dailySupplySideRevenue.addGasToken(amount, label);
    });
    dailyHoldersRevenue.addGasToken(ethSpent - toDepositors - toPurchasers, METRICS.TokenBuyBackAndBurn);
  });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "ETH paid by purchasers for pulls.",
  Fees: "Acquisition fees net of quick-sell payouts, plus settlement fees, retained penalties and early crown exit fees.",
  Revenue: "Protocol's cut of fees after builder rewards, minus the FWA rewards and caller incentive paid from buybacks.",
  ProtocolRevenue: "Protocol fees paid out to the team.",
  HoldersRevenue: "FWA bought back with protocol fees and burned.",
  SupplySideRevenue: "Fees paid to NFT depositors, builder rewards, and the FWA rewards and caller incentive paid from buybacks.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "ETH paid by purchasers for pulls, net of payouts to purchasers who sell the NFT back.",
    [METRICS.SettlementFees]: "1% of the listing backing when the purchaser keeps or relists the NFT.",
    [METRICS.RetainedSettlements]: "Part of the listing backing kept when a purchaser sells the NFT back.",
    [METRICS.EarlyCrownExitFees]: "1% of the backing when the top listing is withdrawn or reduced within 12 hours.",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol's cut of acquisition fees.",
    [METRICS.SettlementFees]: "Settlement fees kept by the protocol.",
    [METRICS.RetainedSettlements]: "Retained penalties kept by the protocol.",
    [METRICS.EarlyCrownExitFees]: "Early crown exit fees kept by the protocol.",
    [METRICS.BuybackRewardsToDepositors]: "Part of the protocol's cut paid out as FWA to depositors, moved to supply side when the buyback executes.",
    [METRICS.BuybackRewardsToPurchasers]: "Part of the protocol's cut paid out as FWA to purchasers, moved to supply side when the buyback executes.",
    [METRICS.BuybackCallerIncentive]: "Part of the protocol's cut paid to the buyback caller, moved to supply side when the buyback executes.",
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Acquisition fees paid to NFT depositors.",
    [METRICS.TopListingReward]: "Acquisition fees paid to the top-backed listing.",
    [METRICS.BuilderRewards]: "Share of protocol fees paid to third parties that submit pulls for purchasers.",
    [METRICS.BuybackRewardsToDepositors]: "FWA from buybacks paid to depositors.",
    [METRICS.BuybackRewardsToPurchasers]: "FWA from buybacks paid to purchasers.",
    [METRICS.BuybackCallerIncentive]: "ETH paid to whoever runs a buyback.",
  },
  ProtocolRevenue: {
    [METRICS.FeePayoutsToTeam]: "Protocol fees paid out to the team wallet.",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBackAndBurn]: "FWA bought back with protocol fees and burned.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // quick-sell payouts and buyback rewards can exceed the fees of the same window
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-09-16',
  methodology,
  breakdownMethodology,
};

export default adapter;
