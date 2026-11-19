import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FWA = "0xB276F62DB0ce8CA2Ca5bc522695bE604521eAc1c";
const FWA_DEPLOY_BLOCK = 25546793;
// Splitter: non-buyback protocol fees, ownerShareBps to the team, rest to snapshot NFT holders
const SPLITTER = "0x1C175b9F0e8C73eD3e677e1cBb1B5A2DD4373Bfe";
// FWAToken: buyback() swaps routed fees for FWA, pays CALLER_REWARD_BPS, splits FWA to depositors / purchasers / burn
const FWA_TOKEN = "0xa0df17b5ac76ababa36e1450e2cbcd18a620c845";
// protocolFeeToTokenBps has no getter, read from ConfigSet key 23
const PROTOCOL_FEE_TO_TOKEN_BPS_KEY = '23';
const BUYBACK = "0xabc98D86eA62919399c4211251890308Ce37A6BF";
const BPS = 10_000n;

const METRICS = {
  AcquisitionFees: 'Acquisition Fees',
  SettlementFees: 'Settlement Fees',
  RetainedSettlements: 'Retained Settlement Penalties',
  TopListingReward: 'Top Listing Reward',
  AcquisitionToNFTHolders: 'Acquisition Fees to Snapshot NFT Holders',
  SettlementToNFTHolders: 'Settlement Fees to Snapshot NFT Holders',
  RetainedToNFTHolders: 'Retained Settlement Penalties to Snapshot NFT Holders',
  BuybackRewardsToDepositors: 'FWA Rewards To Depositors',
  BuybackRewardsToPurchasers: 'FWA Rewards To Purchasers',
  BuybackCallerIncentive: 'Buyback Caller Incentive',
  TokenBuyBackAndBurn: 'Token Buy Back And Burn',
  RetroactiveBuybacks: 'Retroactive buybacks',
  FeesToTeam: 'Fees To Team',
};

const ABIS = {
  OwnerFeesAccrued: "event OwnerFeesAccrued(uint256 amount)",
  EarningsAccrued: "event EarningsAccrued(address indexed depositor, uint256 indexed listingId, uint256 amount)",
  TopListingFunded: "event TopListingFunded(uint256 indexed listingId, uint256 amount, uint256 newPot)",
  NFTKept: "event NFTKept(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 backing)",
  NFTRelisted: "event NFTRelisted(uint256 indexed listingId, uint256 indexed newListingId, uint256 toDepositor)",
  DepositorBidAccepted: "event DepositorBidAccepted(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 payout, uint256 retained)",
  DepositorBidAcceptedAsTokens: "event DepositorBidAcceptedAsTokens(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 ethPayout, uint256 retained, uint256 tokenOut)",
  ConfigSet: "event ConfigSet(uint256 indexed key, uint256 value)",
  AcquisitionRequested: "event AcquisitionRequested(uint256 indexed requestId, address indexed purchaser, uint256 acquisitionFee, uint256 totalWeight)",
  NFTAllocated: "event NFTAllocated(uint256 indexed requestId, uint256 indexed listingId, address indexed purchaser, address depositor, uint256 value, uint256 randomWord)",
  Bought: "event Bought(address indexed caller, address indexed recipient, uint256 indexed buybackNumber, uint256 ethSpent, uint256 amountBought, uint256 callerReward)",
  TokenBought: "event Bought(address indexed caller, uint256 ethSpent, uint256 amountBought, uint256 callerReward)",
  BuybackRouted: "event BuybackRouted(uint256 toDepositors, uint256 toPurchasers, uint256 burned)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [ownerSettlementFeeBps, retainedToProtocol, ownerShareBps, callerRewardBps, routeDepositorBps, routePurchaserBps] = await Promise.all([
    options.api.call({ target: FWA, abi: 'uint256:ownerSettlementFeeBps' }),
    options.api.call({ target: FWA, abi: 'bool:retainedToProtocol' }),
    options.api.call({ target: SPLITTER, abi: 'uint16:ownerShareBps' }),
    options.api.call({ target: FWA_TOKEN, abi: 'uint256:CALLER_REWARD_BPS' }),
    options.api.call({ target: FWA_TOKEN, abi: 'uint256:routeDepositorBps' }),
    options.api.call({ target: FWA_TOKEN, abi: 'uint256:routePurchaserBps' }),
  ]);

  const [ownerFees, earnings, topListingFunded, nftKept, nftRelisted, bidAccepted, bidAcceptedAsTokens, allocated, bought, tokenBuybacks, buybackRoutes] = await Promise.all([
    options.getLogs({ target: FWA, eventAbi: ABIS.OwnerFeesAccrued }),
    options.getLogs({ target: FWA, eventAbi: ABIS.EarningsAccrued }),
    options.getLogs({ target: FWA, eventAbi: ABIS.TopListingFunded }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTKept }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTRelisted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.DepositorBidAccepted }),
    options.getLogs({ target: FWA, eventAbi: ABIS.DepositorBidAcceptedAsTokens }),
    options.getLogs({ target: FWA, eventAbi: ABIS.NFTAllocated }),
    options.getLogs({ target: BUYBACK, eventAbi: ABIS.Bought }),
    options.getLogs({ target: FWA_TOKEN, eventAbi: ABIS.TokenBought, onlyArgs: false }),
    options.getLogs({ target: FWA_TOKEN, eventAbi: ABIS.BuybackRouted, onlyArgs: false }),
  ]);

  // Volume: pull price from AcquisitionRequested (~1 day lookback), counted on NFTAllocated
  const requested = await options.getLogs({
    target: FWA,
    eventAbi: ABIS.AcquisitionRequested,
    fromBlock: Number(await options.getFromBlock()) - 7_200,
  });
  const feeByRequest = new Map<string, bigint>();
  requested.forEach((log: any) => feeByRequest.set(String(log.requestId), BigInt(log.acquisitionFee)));
  let pullVolume = 0n;
  allocated.forEach((log: any) => { pullVolume += feeByRequest.get(String(log.requestId)) ?? 0n; });
  dailyVolume.addGasToken(pullVolume);

  // Quick-sell payouts (depositor bid accepted) netted out of fees and supply side
  let quickSellPayouts = 0n;
  bidAccepted.forEach((log: any) => { quickSellPayouts += BigInt(log.payout); });
  bidAcceptedAsTokens.forEach((log: any) => { quickSellPayouts += BigInt(log.ethPayout); });
  dailyFees.addGasToken(-quickSellPayouts, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(-quickSellPayouts, METRICS.AcquisitionFees);

  // Depositor earnings and top-listing pot
  earnings.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.addGasToken(log.amount, METRICS.AcquisitionFees);
  });
  topListingFunded.forEach((log: any) => {
    dailyFees.addGasToken(log.amount, METRICS.AcquisitionFees);
    dailySupplySideRevenue.addGasToken(log.amount, METRICS.TopListingReward);
  });

  // Settlement fee: events carry the net payout, fee = net * bps / (BPS - bps)
  const settleBps = BigInt(ownerSettlementFeeBps);
  let settlementFees = 0n;
  nftKept.forEach((log: any) => { settlementFees += BigInt(log.backing) * settleBps / (BPS - settleBps); });
  nftRelisted.forEach((log: any) => { settlementFees += BigInt(log.toDepositor) * settleBps / (BPS - settleBps); });
  dailyFees.addGasToken(settlementFees, METRICS.SettlementFees);

  // Retained penalty: to the protocol if retainedToProtocol, else to depositors
  let retained = 0n;
  bidAccepted.forEach((log: any) => { retained += BigInt(log.retained); });
  bidAcceptedAsTokens.forEach((log: any) => { retained += BigInt(log.retained); });
  dailyFees.addGasToken(retained, METRICS.RetainedSettlements);
  if (!retainedToProtocol) dailySupplySideRevenue.addGasToken(retained, METRICS.RetainedSettlements);

  // Acquisition cut: OwnerFeesAccrued minus settlement-side accruals
  let totalOwnerFees = 0n;
  ownerFees.forEach((log: any) => { totalOwnerFees += BigInt(log.amount); });
  let acquisitionCut = totalOwnerFees - settlementFees - (retainedToProtocol ? retained : 0n);
  if (acquisitionCut < 0n) acquisitionCut = 0n;
  dailyFees.addGasToken(acquisitionCut, METRICS.AcquisitionFees);

  // Protocol take split at window-end rates: buyback (caller, rewards, burn) and Splitter (team, NFT holders)
  const configLogs = await options.getLogs({ target: FWA, eventAbi: ABIS.ConfigSet, fromBlock: FWA_DEPLOY_BLOCK, cacheInCloud: true, onlyArgs: false });
  const feeToTokenUpdates = configLogs
    .filter((log: any) => String(log.args.key) === PROTOCOL_FEE_TO_TOKEN_BPS_KEY)
    .sort((a: any, b: any) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const feeToTokenBps = feeToTokenUpdates.length ? BigInt(feeToTokenUpdates[feeToTokenUpdates.length - 1].args.value) : 0n;

  const components: [bigint, string, string][] = [
    [acquisitionCut, METRICS.AcquisitionFees, METRICS.AcquisitionToNFTHolders],
    [settlementFees, METRICS.SettlementFees, METRICS.SettlementToNFTHolders],
    [retainedToProtocol ? retained : 0n, METRICS.RetainedSettlements, METRICS.RetainedToNFTHolders],
  ];
  components.forEach(([amount, label, nftLabel]) => {
    const toBuyback = amount * feeToTokenBps / BPS;
    const toSplitter = amount - toBuyback;
    const toTeam = toSplitter * BigInt(ownerShareBps) / BPS;
    const callerReward = toBuyback * BigInt(callerRewardBps) / BPS;
    const spentOnFWA = toBuyback - callerReward;
    const toDepositors = spentOnFWA * BigInt(routeDepositorBps) / BPS;
    const toPurchasers = spentOnFWA * BigInt(routePurchaserBps) / BPS;
    const burned = spentOnFWA - toDepositors - toPurchasers;

    dailyRevenue.addGasToken(toTeam + burned, label);
    dailySupplySideRevenue.addGasToken(toSplitter - toTeam, nftLabel);
    dailySupplySideRevenue.addGasToken(toDepositors, METRICS.BuybackRewardsToDepositors);
    dailySupplySideRevenue.addGasToken(toPurchasers, METRICS.BuybackRewardsToPurchasers);
    dailySupplySideRevenue.addGasToken(callerReward, METRICS.BuybackCallerIncentive);
  });

  // Holders: ETH value of burned FWA, BuybackRouted paired with Bought by tx
  const routesByTx = new Map<string, any[]>();
  buybackRoutes.forEach((log: any) => {
    const tx = String(log.transactionHash).toLowerCase();
    routesByTx.set(tx, [...(routesByTx.get(tx) ?? []), log]);
  });
  tokenBuybacks.forEach((log: any) => {
    const amountBought = BigInt(log.args.amountBought);
    if (amountBought === 0n) return;
    const route = routesByTx.get(String(log.transactionHash).toLowerCase())?.shift();
    if (!route) throw new Error(`FWA: no BuybackRouted log for the buyback in ${log.transactionHash}`);
    dailyHoldersRevenue.addGasToken(BigInt(log.args.ethSpent) * BigInt(route.args.burned) / amountBought, METRICS.TokenBuyBackAndBurn);
  });

  // Retroactive buybacks (327 ETH of past team fees, FWA to the team wallet): holders only, fees already booked
  bought.forEach((log: any) => { dailyHoldersRevenue.addGasToken(log.ethSpent, METRICS.RetroactiveBuybacks); });

  // ProtocolRevenue = Revenue - HoldersRevenue
  const dailyProtocolRevenue = dailyRevenue.clone(1, METRICS.FeesToTeam);
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, METRICS.FeesToTeam);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Gross ETH paid by purchasers for acquisitions (pulls), net of refunded, expired, or slippage-cancelled requests.",
  Fees: "Net Acquisition fees paid by NFT purchasers, plus settlement fees taken from listing backings.",
  Revenue: "Team share of the protocol's cut of acquisition and settlement fees, plus the part of the cut spent on FWA that is burned.",
  ProtocolRevenue: "Team share of the protocol's fee cut, per the Splitter contract's live split, minus the FWA-token buybacks counted under HoldersRevenue.",
  HoldersRevenue: "FWA bought back with protocol fees and burned, plus retroactive scheduled buybacks funded from previously earned team fees.",
  SupplySideRevenue: "Share of net acquisition fees distributed to NFT depositors (equal split across active listings plus the top-listing pot), the snapshot soulbound-NFT holders' share of protocol fees via the Splitter, and the FWA rewards to depositors and purchasers and the caller incentive paid from buybacks.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "The total ETH paid by purchasers to acquire a random NFT from the pool, net of refunded requests and of quick-sell payouts returned to purchasers (the depositor's standing bid, 85% of the listing backing until 2026-08-04 and 90% since).",
    [METRICS.SettlementFees]: "1% of the listing backing, charged when a settlement returns the backing to the depositor (purchaser keeps or relists the NFT).",
    [METRICS.RetainedSettlements]: "Part of the listing backing retained when a purchaser accepts the depositor's standing bid instead of keeping the NFT (15% until 2026-08-04, 10% since).",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol cut (1%) of acquisition fees kept by the team or spent on burned FWA.",
    [METRICS.SettlementFees]: "Settlement fees kept by the team or spent on burned FWA.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties kept by the team or spent on burned FWA.",
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Share of net acquisition fees distributed to NFT depositors, split equally across active listings.",
    [METRICS.TopListingReward]: "Share of acquisition fees accruing to the depositor of the top-backed listing.",
    [METRICS.AcquisitionToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of the protocol's cut of acquisition fees.",
    [METRICS.SettlementToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of settlement fees.",
    [METRICS.RetainedToNFTHolders]: "Snapshot soulbound-NFT holders' share (via the Splitter) of retained settlement penalties.",
    [METRICS.RetainedSettlements]: "Settlement discount redistributed among active NFT depositors.",
    [METRICS.BuybackRewardsToDepositors]: "FWA from buybacks paid to depositors.",
    [METRICS.BuybackRewardsToPurchasers]: "FWA from buybacks paid to purchasers.",
    [METRICS.BuybackCallerIncentive]: "ETH paid to whoever runs a buyback.",
  },
  ProtocolRevenue: {
    [METRICS.FeesToTeam]: "Team share of acquisition fees, settlement fees and retained settlement penalties, minus burned and retroactive FWA-token buybacks.",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBackAndBurn]: "FWA bought back with protocol fees and burned.",
    [METRICS.RetroactiveBuybacks]: "Scheduled FWA-token buybacks (327 ETH in 1 ETH slices every 2 hours) funded from previously earned team fees; the bought FWA went to the team wallet.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // quick-sell payouts can exceed pull spend, buybacks can exceed the team share
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2026-07-20',
  methodology,
  breakdownMethodology,
};

export default adapter;
