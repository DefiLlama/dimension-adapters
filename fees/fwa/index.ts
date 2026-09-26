import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FWA = "0xB276F62DB0ce8CA2Ca5bc522695bE604521eAc1c";
// Splitter: receives all protocol fees via payoutFees(), splits them between the
// team (ownerShareBps) and the v1 snapshot soulbound-NFT holders (the remainder)
const SPLITTER = "0x1C175b9F0e8C73eD3e677e1cBb1B5A2DD4373Bfe";
const BUYBACK = "0xabc98D86eA62919399c4211251890308Ce37A6BF";
// FWA V2 (FWAV2, verified source): deployed 2026-09-10, acquisitions enabled 2026-09-16. Runs next
// to V1 with its own pool. payoutFees() sends a protocolFeeToTokenBps slice of the accrued protocol
// fees (all of it since deploy) to a dedicated FWA buyback reserve and the rest to the owner wallet
const FWA_V2 = "0x958C41181182e76F221331b2755b77D9e1426A98";
// V2 rewards module: pays the caller that submitted a pull for someone else (a "builder")
// builderRewardBps (15%) of the protocol fee on that pull and on its final settlement
const FWA_V2_REWARDS = "0xA54b44C7a894AA19C49734A753D01f9B8C5f6516";
// FWAV2Buyback (verified on Blockscout): a separate, permissionless buyback() tx spends the reserve,
// pays its caller an ETH incentive and splits the FWA bought into depositor rewards, purchaser epoch
// rewards and a burn (20% / 60% / 20% since deploy). FWAV2 is the reserve's only funder so far
const FWA_V2_BUYBACK = "0xaba91665cdf921F0f6B33A099337336B324c9793";
const BPS = 10_000n;

const METRICS = {
  AcquisitionFees: 'Acquisition Fees',
  SettlementFees: 'Settlement Fees',
  RetainedSettlements: 'Retained Settlement Penalties',
  TopListingReward: 'Top Listing Reward',
  AcquisitionToNFTHolders: 'Acquisition Fees to Snapshot NFT Holders',
  SettlementToNFTHolders: 'Settlement Fees to Snapshot NFT Holders',
  RetainedToNFTHolders: 'Retained Settlement Penalties to Snapshot NFT Holders',
  TokenBuyBack: 'Token Buy Back',
  RetroactiveBuybacks: 'Retroactive buybacks',
  EarlyCrownExitFees: 'Early Crown Exit Fees',
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
  NFTKept: "event NFTKept(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 backing)",
  NFTRelisted: "event NFTRelisted(uint256 indexed listingId, uint256 indexed newListingId, uint256 toDepositor)",
  DepositorBidAccepted: "event DepositorBidAccepted(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 payout, uint256 retained)",
  DepositorBidAcceptedAsTokens: "event DepositorBidAcceptedAsTokens(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 ethPayout, uint256 retained, uint256 tokenOut)",
  ProtocolFeesToToken: "event ProtocolFeesToToken(uint256 amount)",
  AcquisitionRequested: "event AcquisitionRequested(uint256 indexed requestId, address indexed purchaser, uint256 acquisitionFee, uint256 totalWeight)",
  NFTAllocated: "event NFTAllocated(uint256 indexed requestId, uint256 indexed listingId, address indexed purchaser, address depositor, uint256 value, uint256 randomWord)",
  Bought: "event Bought(address indexed caller, address indexed recipient, uint256 indexed buybackNumber, uint256 ethSpent, uint256 amountBought, uint256 callerReward)",
  // V2 only
  EarlyCrownExitFee: "event EarlyCrownExitFee(uint256 indexed listingId, address indexed depositor, uint256 grossBacking, uint256 fee)",
  FeesPaidOut: "event FeesPaidOut(address indexed to, uint256 amount)",
  BuybackExecuted: "event Bought(address indexed caller, uint256 ethSpent, uint256 tokensBought, uint256 callerReward, uint256 depositorTokens, uint256 purchaserTokens, uint256 burnedTokens)",
  // Rewards module events. The source names the last field `slice`, renamed here (the topic hash only
  // depends on the types) because `slice` clashes with the Array method on decoded log args
  AcquisitionTokenAccrued: "event AcquisitionTokenAccrued(address indexed caller, uint256 indexed requestId, uint256 builderSlice)",
  SettlementBuilderRewardAccrued: "event SettlementBuilderRewardAccrued(uint256 indexed listingId, address indexed caller, uint256 protocolFee, uint256 builderSlice)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [ownerSettlementFeeBps, retainedToProtocol, ownerShareBps] = await Promise.all([
    options.api.call({ target: FWA, abi: 'uint256:ownerSettlementFeeBps' }),
    options.api.call({ target: FWA, abi: 'bool:retainedToProtocol' }),
    options.api.call({ target: SPLITTER, abi: 'uint16:ownerShareBps' }),
  ]);

  // Events both versions emit with the same signature: one call per event, one bucket per version
  const bothVersions = (eventAbi: string) => options.getLogs({ targets: [FWA, FWA_V2], eventAbi, flatten: false });
  const [
    [ownerFees, ownerFeesV2], [earnings, earningsV2], [topListingFunded, topListingFundedV2],
    [bidAccepted, bidAcceptedV2], [bidAcceptedAsTokens, bidAcceptedAsTokensV2], [allocated, allocatedV2],
    nftKept, nftRelisted, feesToToken, bought,
    crownExitsV2, builderAcquisitionRewardsV2, builderSettlementRewardsV2, teamPayoutsV2, buybacksV2,
  ] = await Promise.all([
    bothVersions(ABIS.OwnerFeesAccrued),
    bothVersions(ABIS.EarningsAccrued),
    bothVersions(ABIS.TopListingFunded),
    bothVersions(ABIS.DepositorBidAccepted),
    bothVersions(ABIS.DepositorBidAcceptedAsTokens),
    bothVersions(ABIS.NFTAllocated),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTKept }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTRelisted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.ProtocolFeesToToken }),
    options.getLogs({ target: BUYBACK, eventAbi: ABIS.Bought }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.EarlyCrownExitFee }),
    options.getLogs({ target: FWA_V2_REWARDS, eventAbi: ABIS.AcquisitionTokenAccrued }),
    options.getLogs({ target: FWA_V2_REWARDS, eventAbi: ABIS.SettlementBuilderRewardAccrued }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.FeesPaidOut }),
    options.getLogs({ target: FWA_V2_BUYBACK, eventAbi: ABIS.BuybackExecuted }),
  ]);

  // Pull volume: the escrowed acquisition price of each pull, counted when the VRF settlement
  // allocates the NFT. NFTAllocated doesn't carry the price, so look it up on the matching 
  // AcquisitionRequested, fetched with a ~1-day block lookback since a request can settle in a later window.
  // VRF request ids embed the requesting contract, so one map serves both versions
  const requested = await options.getLogs({
    targets: [FWA, FWA_V2],
    eventAbi: ABIS.AcquisitionRequested,
    fromBlock: Number(await options.getFromBlock()) - 7_200,
  });
  const feeByRequest = new Map<string, bigint>();
  requested.forEach((log: any) => feeByRequest.set(String(log.requestId), BigInt(log.acquisitionFee)));
  let pullVolume = 0n;
  allocated.concat(allocatedV2).forEach((log: any) => { pullVolume += feeByRequest.get(String(log.requestId)) ?? 0n; });
  dailyVolume.addGasToken(pullVolume);

  // Quick-sell payouts: ETH returned to purchasers who accept the depositor's standing bid
  // (85% of the listing backing) instead of keeping the NFT — the TCG-buyback analog.
  // Netted out of both fees and supply-side revenue (depositor backings fund the payouts)
  // under the acquisition label, keeping Fees = Revenue + SupplySideRevenue exact.
  let quickSellPayouts = 0n;
  bidAccepted.forEach((log: any) => { quickSellPayouts += BigInt(log.payout); });
  bidAcceptedAsTokens.forEach((log: any) => { quickSellPayouts += BigInt(log.ethPayout); });
  dailyFees.addGasToken(-quickSellPayouts, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(-quickSellPayouts, METRICS.AcquisitionFees);

  // Acquisition fees distributed to depositors: equal split across active listings + top-listing pot
  earnings.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.addGasToken(log.amount, METRICS.AcquisitionFees);
  });
  topListingFunded.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.addGasToken(log.amount, METRICS.TopListingReward);
  });

  // Settlement fee on NFT outcomes: events carry the depositor payout net of the cut,
  // so gross the fee back up: fee = net * bps / (BPS - bps)
  const settleBps = BigInt(ownerSettlementFeeBps);
  let settlementFees = 0n;
  nftKept.forEach((log: any) => { settlementFees += BigInt(log.backing) * settleBps / (BPS - settleBps); });
  nftRelisted.forEach((log: any) => { settlementFees += BigInt(log.toDepositor) * settleBps / (BPS - settleBps); });
  dailyFees.addGasToken(settlementFees, METRICS.SettlementFees);

  // Retained penalty on ETH/token settlements (backing minus the purchaser's 85% payout).
  // Routed to the protocol when retainedToProtocol, otherwise shared among active depositors.
  let retained = 0n;
  bidAccepted.forEach((log: any) => { retained += BigInt(log.retained); });
  bidAcceptedAsTokens.forEach((log: any) => { retained += BigInt(log.retained); });
  dailyFees.addGasToken(retained, METRICS.RetainedSettlements);
  if (!retainedToProtocol) dailySupplySideRevenue.addGasToken(retained, METRICS.RetainedSettlements);

  // Protocol cut of acquisition fees: OwnerFeesAccrued aggregates all protocol accruals,
  // so the acquisition cut is the residual after the settlement-side accruals above
  let totalOwnerFees = 0n;
  ownerFees.forEach((log: any) => { totalOwnerFees += BigInt(log.amount); });
  let acquisitionCut = totalOwnerFees - settlementFees - (retainedToProtocol ? retained : 0n);
  if (acquisitionCut < 0n) acquisitionCut = 0n;
  dailyFees.addGasToken(acquisitionCut, METRICS.AcquisitionFees);

  // Attribution of the protocol's take: a protocolFeeToTokenBps slice can be
  // diverted to FWA-token buybacks at payout time (holders revenue); the rest goes to the
  // Splitter, which pays the team ownerShareBps (70%) and the v1 snapshot soulbound-NFT
  // holders the remainder (30%)
  const protocolTake = settlementFees + (retainedToProtocol ? retained : 0n) + acquisitionCut;
  let toTokenBuyback = 0n;
  feesToToken.forEach((log: any) => { toTokenBuyback += BigInt(log.amount); });
  let splitterShare = protocolTake - toTokenBuyback;
  if (splitterShare < 0n) splitterShare = 0n;
  const teamShare = splitterShare * BigInt(ownerShareBps) / BPS;
  const nftHoldersShare = splitterShare - teamShare;
  const proRata = (amount: bigint, share: bigint) => protocolTake > 0n ? amount * share / protocolTake : 0n;
  const components: [bigint, string, string][] = [
    [acquisitionCut, METRICS.AcquisitionFees, METRICS.AcquisitionToNFTHolders],
    [settlementFees, METRICS.SettlementFees, METRICS.SettlementToNFTHolders],
    [retainedToProtocol ? retained : 0n, METRICS.RetainedSettlements, METRICS.RetainedToNFTHolders],
  ];
  components.forEach(([amount, label, nftLabel]) => {
    dailyRevenue.addGasToken(proRata(amount, teamShare), label);
    dailyProtocolRevenue.addGasToken(proRata(amount, teamShare), label);
    dailySupplySideRevenue.addGasToken(proRata(amount, nftHoldersShare), nftLabel);
  });
  // ProtocolFeesToToken fires when the slice is paid out, which can be a later window than the
  // one that accrued it, so it can exceed this window's protocolTake - that is why splitterShare
  // clamps above. Book only the part this window actually earned as revenue, or revenue plus
  // supply side would exceed the fees the window recorded. Holders revenue keeps the full amount:
  // it is an attribution of the buyback and is allowed to land in a different window.
  const buybackFromWindowFees = toTokenBuyback > protocolTake ? protocolTake : toTokenBuyback;
  dailyRevenue.addGasToken(buybackFromWindowFees, METRICS.TokenBuyBack);
  dailyHoldersRevenue.addGasToken(toTokenBuyback, METRICS.TokenBuyBack);

  // Retroactive buybacks: 327 ETH of already-earned team fees swapped for FWA on a fixed
  // 2-hour schedule via the FWABuyback executor. Holders revenue only because the funding fees
  // were already booked as protocol revenue when they accrued
  bought.forEach((log: any) => { dailyHoldersRevenue.addGasToken(log.ethSpent, METRICS.RetroactiveBuybacks); });

  // ---- V2 ----
  // Same pool mechanics as V1 (quick-sell payouts, depositor earnings, top-listing pot), plus a builder
  // reward carved out of the protocol fee, an early crown exit fee, and no Splitter: the protocol cut
  // accrues to the owner payout, from which the buyback slice is sent on at payout time
  let quickSellPayoutsV2 = 0n;
  bidAcceptedV2.forEach((log: any) => { quickSellPayoutsV2 += BigInt(log.payout); });
  bidAcceptedAsTokensV2.forEach((log: any) => { quickSellPayoutsV2 += BigInt(log.ethPayout); });
  dailyFees.addGasToken(-quickSellPayoutsV2, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(-quickSellPayoutsV2, METRICS.AcquisitionFees);

  earningsV2.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.addGasToken(log.amount, METRICS.AcquisitionFees);
  });
  topListingFundedV2.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.addGasToken(log.amount, METRICS.TopListingReward);
  });

  // Every final settlement reports its protocol fee, gross of the builder share: the 1% settlement cut
  // when the depositor gets the backing back (0 for fee-exempt FWAIR launch listings), or the retained
  // penalty when the purchaser takes the bid. A retained penalty shared among depositors reports 0 here
  // and reaches them through EarningsAccrued above
  const retainedListingsV2 = new Set(bidAcceptedV2.concat(bidAcceptedAsTokensV2).map((log: any) => String(log.listingId)));
  const settlementV2 = { fee: 0n, builderShare: 0n };
  const retainedV2 = { fee: 0n, builderShare: 0n };
  builderSettlementRewardsV2.forEach((log: any) => {
    const bucket = retainedListingsV2.has(String(log.listingId)) ? retainedV2 : settlementV2;
    bucket.fee += BigInt(log.protocolFee);
    bucket.builderShare += BigInt(log.builderSlice);
  });
  const acquisitionV2 = { fee: 0n, builderShare: 0n };
  builderAcquisitionRewardsV2.forEach((log: any) => { acquisitionV2.builderShare += BigInt(log.builderSlice); });
  // 1% of the backing when the top listing is withdrawn or reduced within 12h of taking the top spot
  let crownExitFeesV2 = 0n;
  crownExitsV2.forEach((log: any) => { crownExitFeesV2 += BigInt(log.fee); });

  // OwnerFeesAccrued is the protocol's take net of builder rewards, across acquisitions, settlements,
  // and crown exit fees (plus any pool share with no active listing to receive it), so the acquisition
  // cut is the residual once builder rewards are added back and the settlement-side fees removed.
  // Every leg is emitted in the same tx as its OwnerFeesAccrued, so a negative residual means
  // missing logs rather than timing
  let ownerFeesV2Total = 0n;
  ownerFeesV2.forEach((log: any) => { ownerFeesV2Total += BigInt(log.amount); });
  acquisitionV2.fee = ownerFeesV2Total + acquisitionV2.builderShare + settlementV2.builderShare + retainedV2.builderShare
    - settlementV2.fee - retainedV2.fee - crownExitFeesV2;
  if (acquisitionV2.fee < 0n) throw new Error(`FWA V2: protocol accruals below the settlement-side fees (${acquisitionV2.fee})`);

  const protocolFeesV2: [{ fee: bigint, builderShare: bigint }, string][] = [
    [acquisitionV2, METRICS.AcquisitionFees],
    [settlementV2, METRICS.SettlementFees],
    [retainedV2, METRICS.RetainedSettlements],
    [{ fee: crownExitFeesV2, builderShare: 0n }, METRICS.EarlyCrownExitFees],
  ];
  // The net cut is revenue when it accrues: it sits in the contract until payoutFees() and then in the
  // buyback reserve, both protocol-controlled
  protocolFeesV2.forEach(([{ fee, builderShare }, label]) => {
    dailyFees.addGasToken(fee, label);
    dailySupplySideRevenue.addGasToken(builderShare, METRICS.BuilderRewards);
    dailyRevenue.addGasToken(fee - builderShare, label);
  });

  // Where the cut goes, booked only from executed transfers, in the window they happen:
  // payoutFees() sends the owner slice to the team wallet (FeesPaidOut) and the rest to the buyback
  // reserve; each buyback() tx pays its caller an ETH incentive and swaps the rest for FWA, split into
  // depositor rewards, purchaser epoch rewards and a burn. Only the burn reaches FWA holders. The
  // rewards and incentive go to protocol users, so they move from revenue to supply side when paid
  teamPayoutsV2.forEach((log: any) => { dailyProtocolRevenue.addGasToken(log.amount, METRICS.FeePayoutsToTeam); });
  buybacksV2.forEach((log: any) => {
    const ethSpent = BigInt(log.ethSpent);
    const tokensBought = BigInt(log.tokensBought);
    const toDepositors = ethSpent * BigInt(log.depositorTokens) / tokensBought;
    const toPurchasers = ethSpent * BigInt(log.purchaserTokens) / tokensBought;
    const burned = ethSpent - toDepositors - toPurchasers;
    const rewards: [bigint, string][] = [
      [toDepositors, METRICS.BuybackRewardsToDepositors],
      [toPurchasers, METRICS.BuybackRewardsToPurchasers],
      [BigInt(log.callerReward), METRICS.BuybackCallerIncentive],
    ];
    rewards.forEach(([amount, label]) => {
      dailyRevenue.addGasToken(-amount, label);
      dailySupplySideRevenue.addGasToken(amount, label);
    });
    dailyHoldersRevenue.addGasToken(burned, METRICS.TokenBuyBackAndBurn);
  });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "ETH paid by purchasers for pulls on FWA V1 and V2, excluding refunded requests.",
  Fees: "Acquisition fees paid by purchasers (net of quick-sell payouts), plus settlement fees, retained penalties and early crown exit fees taken from listing backings.",
  Revenue: "Protocol's cut of fees kept by the team or spent on FWA buybacks, minus the V2 buyback rewards and caller incentive when they are paid out.",
  ProtocolRevenue: "Protocol's cut of fees paid to the team.",
  HoldersRevenue: "FWA bought back with protocol fees (on V2 only the part actually burned, when the buyback executes), plus V1's scheduled retroactive buybacks.",
  SupplySideRevenue: "Acquisition fees paid to NFT depositors, the V1 snapshot NFT holders' share, V2 builder rewards, and the FWA rewards and caller incentive paid from V2 buybacks.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "ETH paid by purchasers for pulls, net of refunds and of the ETH or FWA paid out to purchasers who sell the NFT back to the depositor.",
    [METRICS.SettlementFees]: "1% of the listing backing when the purchaser keeps or relists the NFT (V2 FWAIR launch listings are exempt).",
    [METRICS.RetainedSettlements]: "Part of the listing backing kept when a purchaser sells the NFT back to the depositor.",
    [METRICS.EarlyCrownExitFees]: "V2: 1% of the backing when the top listing is withdrawn or reduced within 12 hours.",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol's 1% cut of acquisition fees that it keeps.",
    [METRICS.SettlementFees]: "Settlement fees the protocol keeps.",
    [METRICS.RetainedSettlements]: "Retained penalties the protocol keeps.",
    [METRICS.EarlyCrownExitFees]: "Early crown exit fees the protocol keeps.",
    [METRICS.TokenBuyBack]: "V1 protocol fees sent to FWA buybacks.",
    [METRICS.BuybackRewardsToDepositors]: "V2: deducted when a buyback pays FWA rewards to active depositors.",
    [METRICS.BuybackRewardsToPurchasers]: "V2: deducted when a buyback pays FWA rewards to purchasers.",
    [METRICS.BuybackCallerIncentive]: "V2: deducted when a buyback pays its caller incentive.",
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Acquisition fees paid to NFT depositors, split equally across active listings.",
    [METRICS.TopListingReward]: "Share of acquisition fees paid to the top-backed listing.",
    [METRICS.AcquisitionToNFTHolders]: "V1 snapshot NFT holders' share of the protocol's acquisition cut.",
    [METRICS.SettlementToNFTHolders]: "V1 snapshot NFT holders' share of settlement fees.",
    [METRICS.RetainedToNFTHolders]: "V1 snapshot NFT holders' share of retained penalties.",
    [METRICS.RetainedSettlements]: "Retained penalties shared among active depositors instead of the protocol.",
    [METRICS.BuilderRewards]: "V2: 15% of protocol fees paid to third parties that submit pulls for purchasers.",
    [METRICS.BuybackRewardsToDepositors]: "V2: FWA from buybacks paid to active depositors (currently 20% of each buyback).",
    [METRICS.BuybackRewardsToPurchasers]: "V2: FWA from buybacks paid to purchasers (currently 60% of each buyback).",
    [METRICS.BuybackCallerIncentive]: "V2: ETH paid to whoever runs a buyback (currently 0.5%).",
  },
  ProtocolRevenue: {
    [METRICS.AcquisitionFees]: "V1: team share of the protocol's acquisition cut.",
    [METRICS.SettlementFees]: "V1: team share of settlement fees.",
    [METRICS.RetainedSettlements]: "V1: team share of retained penalties.",
    [METRICS.FeePayoutsToTeam]: "V2: protocol fees paid out to the team wallet (none so far, the whole cut goes to buybacks).",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBack]: "V1 protocol fees sent to FWA buybacks.",
    [METRICS.TokenBuyBackAndBurn]: "V2: FWA bought back with protocol fees and burned, booked when the buyback executes (currently 20% of each buyback).",
    [METRICS.RetroactiveBuybacks]: "Scheduled FWA buybacks (327 ETH in 1 ETH slices every 2 hours) funded from previously earned team fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // quick-sell payouts can exceed same-window pull spend, and V2 buyback rewards paid in a window can exceed the cut it accrued
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-07-20',
  methodology,
  breakdownMethodology,
};

export default adapter;
