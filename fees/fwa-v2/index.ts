import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// FWAV2, rewards module (builder rewards) and FWAV2Buyback, all verified on Blockscout
const FWA_V2 = "0x958C41181182e76F221331b2755b77D9e1426A98";
const REWARDS = "0xA54b44C7a894AA19C49734A753D01f9B8C5f6516";
const BUYBACK = "0xaba91665cdf921F0f6B33A099337336B324c9793";
const FWA_V2_DEPLOY_BLOCK = 25944609;
// protocolFeeToTokenBps (share of the cut sent to the buyback) has no getter; each change emits ConfigSet with key 23
const PROTOCOL_FEE_TO_TOKEN_BPS_KEY = '23';
const BPS = 10_000n;

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
  ConfigSet: "event ConfigSet(uint256 indexed key, uint256 value)",
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
    crownExits, acquisitionRewards, settlementRewards, buybacks,
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
  // The net cut is split with the rates at the window's end block: protocolFeeToTokenBps goes to the buyback
  // and the rest to the team; each buyback pays its caller callerRewardBps and splits the FWA it buys into
  // depositor rewards, purchaser rewards and a burn
  const [configLogs, callerRewardBps, routeDepositorBps, routePurchaserBps] = await Promise.all([
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.ConfigSet, fromBlock: FWA_V2_DEPLOY_BLOCK, cacheInCloud: true, onlyArgs: false }),
    options.api.call({ target: BUYBACK, abi: 'uint256:callerRewardBps' }),
    options.api.call({ target: BUYBACK, abi: 'uint256:routeDepositorBps' }),
    options.api.call({ target: BUYBACK, abi: 'uint256:routePurchaserBps' }),
  ]);
  const feeToBuybackUpdates = configLogs
    .filter((log: any) => String(log.args.key) === PROTOCOL_FEE_TO_TOKEN_BPS_KEY)
    .sort((a: any, b: any) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const feeToBuybackBps = feeToBuybackUpdates.length ? BigInt(feeToBuybackUpdates[feeToBuybackUpdates.length - 1].args.value) : 0n;

  protocolFees.forEach(([{ fee, builderShare }, label]) => {
    dailyFees.addGasToken(fee, label);
    dailySupplySideRevenue.addGasToken(builderShare, METRICS.BuilderRewards);

    const netFee = fee - builderShare;
    const toBuyback = netFee * feeToBuybackBps / BPS;
    const toTeam = netFee - toBuyback;
    const callerReward = toBuyback * BigInt(callerRewardBps) / BPS;
    const spentOnFWA = toBuyback - callerReward;
    const toDepositors = spentOnFWA * BigInt(routeDepositorBps) / BPS;
    const toPurchasers = spentOnFWA * BigInt(routePurchaserBps) / BPS;
    const burned = spentOnFWA - toDepositors - toPurchasers;

    dailyRevenue.addGasToken(toTeam + burned, label);
    dailyProtocolRevenue.addGasToken(toTeam, label);
    dailySupplySideRevenue.addGasToken(toDepositors, METRICS.BuybackRewardsToDepositors);
    dailySupplySideRevenue.addGasToken(toPurchasers, METRICS.BuybackRewardsToPurchasers);
    dailySupplySideRevenue.addGasToken(callerReward, METRICS.BuybackCallerIncentive);
  });

  // Holders revenue is the FWA actually burned, valued at the ETH each executed buyback spent on it
  buybacks.forEach((log: any) => {
    dailyHoldersRevenue.addGasToken(BigInt(log.ethSpent) * BigInt(log.burnedTokens) / BigInt(log.tokensBought), METRICS.TokenBuyBackAndBurn);
  });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "ETH paid by purchasers for pulls.",
  Fees: "Acquisition fees net of quick-sell payouts, plus settlement fees, retained penalties and early crown exit fees.",
  Revenue: "Protocol's cut of fees after builder rewards, kept by the team or spent on burned FWA.",
  ProtocolRevenue: "Protocol's cut of fees paid to the team.",
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
    [METRICS.AcquisitionFees]: "Protocol's cut of acquisition fees kept by the team or spent on burned FWA.",
    [METRICS.SettlementFees]: "Settlement fees kept by the team or spent on burned FWA.",
    [METRICS.RetainedSettlements]: "Retained penalties kept by the team or spent on burned FWA.",
    [METRICS.EarlyCrownExitFees]: "Early crown exit fees kept by the team or spent on burned FWA.",
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
    [METRICS.AcquisitionFees]: "Team share of the protocol's cut of acquisition fees.",
    [METRICS.SettlementFees]: "Team share of settlement fees.",
    [METRICS.RetainedSettlements]: "Team share of retained penalties.",
    [METRICS.EarlyCrownExitFees]: "Team share of early crown exit fees.",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBackAndBurn]: "FWA bought back with protocol fees and burned.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // quick-sell payouts can exceed the pull spend of the same window
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-09-16',
  methodology,
  breakdownMethodology,
};

export default adapter;
