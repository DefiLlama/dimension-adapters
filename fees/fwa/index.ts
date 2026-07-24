import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const FWA = "0xB276F62DB0ce8CA2Ca5bc522695bE604521eAc1c";
const BPS = 10_000n;

const METRICS = {
  AcquisitionFees: 'Acquisition Fees',
  SettlementFees: 'Settlement Fees',
  RetainedSettlements: 'Retained Settlement Penalties',
  TopListingReward: 'Top Listing Reward'
};

const ABIS = {
  OwnerFeesAccrued: "event OwnerFeesAccrued(uint256 amount)",
  EarningsAccrued: "event EarningsAccrued(address indexed depositor, uint256 indexed listingId, uint256 amount)",
  TopListingFunded: "event TopListingFunded(uint256 indexed listingId, uint256 amount, uint256 newPot)",
  NFTKept: "event NFTKept(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 backing)",
  NFTRelisted: "event NFTRelisted(uint256 indexed listingId, uint256 indexed newListingId, uint256 toDepositor)",
  DepositorBidAccepted: "event DepositorBidAccepted(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 payout, uint256 retained)",
  DepositorBidAcceptedAsTokens: "event DepositorBidAcceptedAsTokens(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 ethPayout, uint256 retained, uint256 tokenOut)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [ownerSettlementFeeBps, retainedToProtocol] = await Promise.all([
    options.api.call({ target: FWA, abi: 'uint256:ownerSettlementFeeBps' }),
    options.api.call({ target: FWA, abi: 'bool:retainedToProtocol' }),
  ]);

  const [ownerFees, earnings, topListingFunded, nftKept, nftRelisted, bidAccepted, bidAcceptedAsTokens] = await Promise.all([
    options.getLogs({ target: FWA, eventAbi: ABIS.OwnerFeesAccrued }),
    options.getLogs({ target: FWA, eventAbi: ABIS.EarningsAccrued }),
    options.getLogs({ target: FWA, eventAbi: ABIS.TopListingFunded }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTKept }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTRelisted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.DepositorBidAccepted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.DepositorBidAcceptedAsTokens }),
  ]);

  // Acquisition fees distributed to depositors: equal split across active listings + top-listing pot
  earnings.forEach((log: any) => {
    dailyFees.add(ADDRESSES.null, log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.add(ADDRESSES.null, log.amount, METRICS.AcquisitionFees);
  });
  topListingFunded.forEach((log: any) => {
    dailyFees.add(ADDRESSES.null, log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.add(ADDRESSES.null, log.amount, METRICS.TopListingReward);
  });

  // Settlement fee on NFT outcomes: events carry the depositor payout net of the cut,
  // so gross the fee back up: fee = net * bps / (BPS - bps)
  const settleBps = BigInt(ownerSettlementFeeBps);
  let settlementFees = 0n;
  nftKept.forEach((log: any) => { settlementFees += BigInt(log.backing) * settleBps / (BPS - settleBps); });
  nftRelisted.forEach((log: any) => { settlementFees += BigInt(log.toDepositor) * settleBps / (BPS - settleBps); });
  dailyFees.add(ADDRESSES.null, settlementFees, METRICS.SettlementFees);
  dailyRevenue.add(ADDRESSES.null, settlementFees, METRICS.SettlementFees);

  // Retained penalty on ETH/token settlements (backing minus the purchaser's 85% payout).
  // Routed to the protocol when retainedToProtocol, otherwise shared among active depositors.
  let retained = 0n;
  bidAccepted.forEach((log: any) => { retained += BigInt(log.retained); });
  bidAcceptedAsTokens.forEach((log: any) => { retained += BigInt(log.retained); });
  dailyFees.add(ADDRESSES.null, retained, METRICS.RetainedSettlements);
  if (retainedToProtocol) dailyRevenue.add(ADDRESSES.null, retained, METRICS.RetainedSettlements);
  else dailySupplySideRevenue.add(ADDRESSES.null, retained, METRICS.RetainedSettlements);

  // Protocol cut of acquisition fees: OwnerFeesAccrued aggregates all protocol accruals,
  // so the acquisition cut is the residual after the settlement-side accruals above
  let totalOwnerFees = 0n;
  ownerFees.forEach((log: any) => { totalOwnerFees += BigInt(log.amount); });
  let acquisitionCut = totalOwnerFees - settlementFees - (retainedToProtocol ? retained : 0n);
  if (acquisitionCut < 0n) acquisitionCut = 0n;
  dailyFees.add(ADDRESSES.null, acquisitionCut, METRICS.AcquisitionFees);
  dailyRevenue.add(ADDRESSES.null, acquisitionCut, METRICS.AcquisitionFees);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Acquisition fees (~10% surcharge over the pool's expected value) paid by NFT purchasers, plus settlement fees taken from listing backings.",
  Revenue: "Protocol cut of acquisition fees (1%) and settlement fees (1% on NFT outcomes, 15% retained on depositor-bid settlements).",
  ProtocolRevenue: "Same as Revenue: shared between the team and snapshot NFT holders via the Splitter contract.",
  SupplySideRevenue: "Share of acquisition fees distributed to NFT depositors (equal split across active listings plus the top-listing pot).",
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
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Share of acquisition fees distributed to NFT depositors, split equally across active listings.",
    [METRICS.TopListingReward]: "Share of acquisition fees accruing to the depositor of the top-backed listing.",
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
