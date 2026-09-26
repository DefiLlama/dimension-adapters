import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FWA = "0xB276F62DB0ce8CA2Ca5bc522695bE604521eAc1c";
// Splitter: receives all protocol fees via payoutFees(), splits them between the
// team (ownerShareBps) and the v1 snapshot soulbound-NFT holders (the remainder)
const SPLITTER = "0x1C175b9F0e8C73eD3e677e1cBb1B5A2DD4373Bfe";
const BUYBACK = "0xabc98D86eA62919399c4211251890308Ce37A6BF";
// FWA V2 (FWAV2, verified source): deployed 2026-09-10, acquisitions enabled 2026-09-16. Runs next
// to V1 with its own pool. Its fee payout goes to the owner wallet, with a protocolFeeToTokenBps
// slice (10000 = all of it since deploy, ConfigSet key 23) sent to a dedicated FWA buyback
const FWA_V2 = "0x958C41181182e76F221331b2755b77D9e1426A98";
// V2 rewards module: pays the caller that submitted a pull for someone else (a "builder")
// builderRewardBps (15%) of the protocol fee on that pull and on its final settlement
const FWA_V2_REWARDS = "0xA54b44C7a894AA19C49734A753D01f9B8C5f6516";
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
  ProtocolFeesToBuyback: "event ProtocolFeesToBuyback(address indexed buyback, uint256 amount)",
  FeesPaidOut: "event FeesPaidOut(address indexed to, uint256 amount)",
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
    crownExitsV2, feesToBuybackV2, feesPaidOutV2, builderAcquisitionRewardsV2, builderSettlementRewardsV2,
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
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.ProtocolFeesToBuyback }),
    options.getLogs({ target: FWA_V2, eventAbi: ABIS.FeesPaidOut }),
    options.getLogs({ target: FWA_V2_REWARDS, eventAbi: ABIS.AcquisitionTokenAccrued }),
    options.getLogs({ target: FWA_V2_REWARDS, eventAbi: ABIS.SettlementBuilderRewardAccrued }),
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
  protocolFeesV2.forEach(([{ fee, builderShare }, label]) => {
    dailyFees.addGasToken(fee, label);
    dailyRevenue.addGasToken(fee - builderShare, label);
    dailySupplySideRevenue.addGasToken(builderShare, METRICS.BuilderRewards);
  });

  // Where V2's revenue goes is only known when payoutFees() runs, a separate tx that can land in a
  // later window, so the team and buyback legs are booked from the payout events themselves
  feesToBuybackV2.forEach((log: any) => { dailyHoldersRevenue.addGasToken(log.amount, METRICS.TokenBuyBack); });
  feesPaidOutV2.forEach((log: any) => { dailyProtocolRevenue.addGasToken(log.amount, METRICS.FeePayoutsToTeam); });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Gross ETH paid by purchasers for acquisitions (pulls) on FWA V1 and V2, net of refunded, expired, or slippage-cancelled requests.",
  Fees: "Net Acquisition fees paid by NFT purchasers, plus settlement fees and retained penalties taken from listing backings, plus V2 early crown exit fees.",
  Revenue: "Protocol's cut of acquisition and settlement fees: on V1 the team share plus any fees diverted to FWA-token buybacks, on V2 the whole cut net of builder rewards.",
  ProtocolRevenue: "Team share of the protocol's fee cut: on V1 per the Splitter contract's live split, on V2 the fee payouts to the team wallet (none so far, V2 sends its whole cut to FWA-token buybacks).",
  HoldersRevenue: "FWA-token buybacks funded from V1 and V2 protocol fees, plus retroactive scheduled buybacks funded from previously earned team fees.",
  SupplySideRevenue: "Share of net acquisition fees distributed to NFT depositors (equal split across active listings plus the top-listing pot), the snapshot soulbound-NFT holders' share of V1 protocol fees via the Splitter, and V2 builder rewards.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "The total ETH paid by purchasers to acquire a random NFT from the pool, net of refunded requests and of quick-sell payouts returned to purchasers (a fixed share of the listing backing, currently 90%, when they accept the depositor's standing bid).",
    [METRICS.SettlementFees]: "1% of the listing backing, charged when a settlement returns the backing to the depositor (purchaser keeps or relists the NFT). V2 FWAIR launch listings are exempt.",
    [METRICS.RetainedSettlements]: "The part of the listing backing kept back from the purchaser's payout when they accept the depositor's standing bid instead of keeping the NFT.",
    [METRICS.EarlyCrownExitFees]: "V2 only: 1% of the backing, charged when the top-backed listing is withdrawn or reduced within 12 hours of taking the top spot.",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol cut (1%) of acquisition fees (V2: net of builder rewards).",
    [METRICS.SettlementFees]: "Settlement fees accrue entirely to the protocol (V2: net of builder rewards).",
    [METRICS.RetainedSettlements]: "Retained settlement penalties accrue to the protocol (V2: net of builder rewards).",
    [METRICS.EarlyCrownExitFees]: "V2 early crown exit fees accrue entirely to the protocol.",
    [METRICS.TokenBuyBack]: "V1 protocol fees diverted to FWA-token buybacks.",
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Share of net acquisition fees distributed to NFT depositors, split equally across active listings.",
    [METRICS.TopListingReward]: "Share of acquisition fees accruing to the depositor of the top-backed listing.",
    [METRICS.AcquisitionToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of the protocol's cut of acquisition fees.",
    [METRICS.SettlementToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of settlement fees.",
    [METRICS.RetainedToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of retained settlement penalties.",
    [METRICS.RetainedSettlements]: "Settlement discount redistributed among active NFT depositors.",
    [METRICS.BuilderRewards]: "V2 only: share of the protocol fee (15%) on pulls, and on their final settlement, paid to the third-party caller that submitted the pull for the purchaser.",
  },
  ProtocolRevenue: {
    [METRICS.AcquisitionFees]: "Protocol cut (1%) of acquisition fees.",
    [METRICS.SettlementFees]: "Settlement fees accrue entirely to the protocol.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties accrue to the protocol.",
    [METRICS.FeePayoutsToTeam]: "V2 protocol fees paid out to the team wallet (none so far: V2 sends its whole cut to FWA-token buybacks).",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBack]: "Protocol fees diverted to FWA-token buybacks (all of the V2 protocol cut since launch).",
    [METRICS.RetroactiveBuybacks]: "Scheduled FWA-token buybacks (327 ETH in 1 ETH slices every 2 hours) funded from previously earned team fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // quick-sell payouts and refunds can exceed same-window pull spend
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-07-20',
  methodology,
  breakdownMethodology,
};

export default adapter;
