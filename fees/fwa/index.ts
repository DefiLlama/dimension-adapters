import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const FWA = "0xB276F62DB0ce8CA2Ca5bc522695bE604521eAc1c";
// Splitter: receives all protocol fees via payoutFees(), splits them between the
// team (ownerShareBps) and the v1 snapshot soulbound-NFT holders (the remainder)
const SPLITTER = "0x1C175b9F0e8C73eD3e677e1cBb1B5A2DD4373Bfe";
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
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
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

  const [ownerFees, earnings, topListingFunded, nftKept, nftRelisted, bidAccepted, bidAcceptedAsTokens, feesToToken] = await Promise.all([
    options.getLogs({ target: FWA, eventAbi: ABIS.OwnerFeesAccrued }),
    options.getLogs({ target: FWA, eventAbi: ABIS.EarningsAccrued }),
    options.getLogs({ target: FWA, eventAbi: ABIS.TopListingFunded }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTKept }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTRelisted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.DepositorBidAccepted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.DepositorBidAcceptedAsTokens }),
    options.getLogs({ target: FWA, eventAbi: ABIS.ProtocolFeesToToken }),
  ]);

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
  dailyRevenue.addGasToken(toTokenBuyback, METRICS.TokenBuyBack);
  dailyHoldersRevenue.addGasToken(toTokenBuyback, METRICS.TokenBuyBack);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Acquisition fees (~10% surcharge over the pool's expected value) paid by NFT purchasers, plus settlement fees taken from listing backings.",
  Revenue: "Team share of the protocol's cut of acquisition and settlement fees, plus any fees diverted to FWA-token buybacks.",
  ProtocolRevenue: "Team share of the protocol's fee cut, per the Splitter contract's live split.",
  HoldersRevenue: "FWA-token buybacks funded from protocol fees.",
  SupplySideRevenue: "Share of acquisition fees distributed to NFT depositors (equal split across active listings plus the top-listing pot), plus the snapshot soulbound-NFT holders' share of protocol fees via the Splitter.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "Fees paid by purchasers to acquire a random NFT from the pool (~10% surcharge over the pool's expected value).",
    [METRICS.SettlementFees]: "1% of the listing backing, charged when a settlement returns the backing to the depositor (purchaser keeps or relists the NFT).",
    [METRICS.RetainedSettlements]: "15% of the listing backing retained when a purchaser accepts the depositor's standing bid instead of keeping the NFT.",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol cut (1%) of acquisition fees.",
    [METRICS.SettlementFees]: "Settlement fees accrue entirely to the protocol.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties accrue to the protocol.",
    [METRICS.TokenBuyBack]: "Protocol fees diverted to FWA-token buybacks.",
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Share of acquisition fees distributed to NFT depositors, split equally across active listings.",
    [METRICS.TopListingReward]: "Share of acquisition fees accruing to the depositor of the top-backed listing.",
    [METRICS.AcquisitionToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of the protocol's cut of acquisition fees.",
    [METRICS.SettlementToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of settlement fees.",
    [METRICS.RetainedToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of retained settlement penalties.",
    [METRICS.RetainedSettlements]: "Settlement discount redistributed among active NFT depositors.",
  },
  ProtocolRevenue: {
    [METRICS.AcquisitionFees]: "Protocol cut (1%) of acquisition fees.",
    [METRICS.SettlementFees]: "Settlement fees accrue entirely to the protocol.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties accrue to the protocol.",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBack]: "Protocol fees diverted to FWA-token buybacks.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-07-20',
  methodology,
  breakdownMethodology,
};

export default adapter;
