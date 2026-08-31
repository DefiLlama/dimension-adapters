import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// StockRip: depositors list a basket NFT (tokenized stocks) with ETH backing, purchasers pay an
// acquisition fee to be allocated one at random, then keep it, relist it, or take a discounted
// settlement of its backing. Contracts are verified on Robinhood Chain Blockscout.
// StockRip core: https://robinhoodchain.blockscout.com/address/0x32E8D5b0b8643dC002864a2F5e4481E59eb714CB
const CORE = "0x32E8D5b0b8643dC002864a2F5e4481E59eb714CB";
// StockRipRewards, credits part of each acquisition fee back to the purchaser as RIP buying power:
// https://robinhoodchain.blockscout.com/address/0x91D032555CB90A8B2792eEaB5F192c41A6a647eF
const REWARDS = "0x91D032555CB90A8B2792eEaB5F192c41A6a647eF";
// StockRipTokenHook, Uniswap v4 hook on the ETH/RIP pool, fee paid to the protocol treasury:
// https://robinhoodchain.blockscout.com/address/0xf295127365a2C3055FdfBa01b0596dA56DCFa444
const HOOK = "0xf295127365a2C3055FdfBa01b0596dA56DCFa444";
// StockRipTokenHook.FEE_BIPS: flat 1% on every swap in both directions (constant in the verified source above)
const HOOK_FEE_BIPS = 100n;
// Basis-point denominator
const BPS = 10_000n;
// Uniswap sqrtPriceX96 is a Q64.96 fixed-point square root, so price = sqrtPriceX96^2 / 2^192
const Q192 = 1n << 192n;

const METRICS = {
  AcquisitionFees: 'Acquisition Fees',
  SettlementFees: 'Settlement Fees',
  RetainedSettlements: 'Retained Settlement Penalties',
  TopListingReward: 'Top Listing Reward',
  SwapFees: 'Swap Fees',
  TokenBuyBack: 'RIP Buyback',
};

const EVENTS = {
  NFTAllocated: "event NFTAllocated(uint256 indexed requestId, uint256 indexed listingId, address indexed purchaser, address depositor, uint256 value, uint256 randomWord)",
  TopListingFunded: "event TopListingFunded(uint256 indexed listingId, uint256 amount, uint256 newPot)",
  NFTKept: "event NFTKept(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 backing)",
  NFTRelisted: "event NFTRelisted(uint256 indexed listingId, uint256 indexed newListingId, uint256 toDepositor)",
  DepositorBidAccepted: "event DepositorBidAccepted(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 payout, uint256 retained)",
  DepositorBidAcceptedAsTokens: "event DepositorBidAcceptedAsTokens(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 ethPayout, uint256 retained, uint256 tokenOut)",
  OwnerFeesAccrued: "event OwnerFeesAccrued(uint256 amount)",
  ProtocolFeesToToken: "event ProtocolFeesToToken(uint256 amount)",
  AcquisitionTokenAccrued: "event AcquisitionTokenAccrued(address indexed purchaser, uint256 indexed requestId, uint256 slice)",
  HookFee: "event HookFee(bytes32 indexed id, address indexed sender, uint128 feeAmount0, uint128 feeAmount1)",
  Trade: "event Trade(uint160 sqrtPriceX96, int128 ethAmount, int128 tokenAmount)",
};
const ACQUISITIONS_ABI = "function acquisitions(uint256) view returns (address purchaser, uint256 requestBlock, uint256 priceEscrowed, uint256 listingId, uint8 status)";

const sumBy = (logs: any[], field: string | number) => logs.reduce((acc: bigint, log: any) => acc + BigInt(log.args[field]), 0n);

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const allocated = await options.getLogs({ target: CORE, eventAbi: EVENTS.NFTAllocated, entireLog: true, parseLog: true });
  const topListingFunded = await options.getLogs({ target: CORE, eventAbi: EVENTS.TopListingFunded, entireLog: true, parseLog: true });
  const nftKept = await options.getLogs({ target: CORE, eventAbi: EVENTS.NFTKept, entireLog: true, parseLog: true });
  const nftRelisted = await options.getLogs({ target: CORE, eventAbi: EVENTS.NFTRelisted, entireLog: true, parseLog: true });
  const bidAccepted = await options.getLogs({ target: CORE, eventAbi: EVENTS.DepositorBidAccepted, entireLog: true, parseLog: true });
  const bidAcceptedAsTokens = await options.getLogs({ target: CORE, eventAbi: EVENTS.DepositorBidAcceptedAsTokens, entireLog: true, parseLog: true });
  const ownerFees = await options.getLogs({ target: CORE, eventAbi: EVENTS.OwnerFeesAccrued, entireLog: true, parseLog: true });
  const feesToToken = await options.getLogs({ target: CORE, eventAbi: EVENTS.ProtocolFeesToToken, entireLog: true, parseLog: true });
  const slices = await options.getLogs({ target: REWARDS, eventAbi: EVENTS.AcquisitionTokenAccrued, entireLog: true, parseLog: true });
  const hookFees = await options.getLogs({ target: HOOK, eventAbi: EVENTS.HookFee, entireLog: true, parseLog: true });
  const trades = await options.getLogs({ target: HOOK, eventAbi: EVENTS.Trade, entireLog: true, parseLog: true });

  // Acquisition fees are booked when the request is allocated. NFTAllocated does not carry the
  // fee, so the escrowed price is read from the acquisition record, which is never modified after
  // the request. Robinhood Chain's public RPC is not an archive node, so it is read at the latest
  // block. Refunded, expired and slippage-cancelled requests never allocate and are excluded.
  const acquisitions = await options.api.multiCall({ abi: ACQUISITIONS_ABI, target: CORE, calls: allocated.map((log: any) => log.args.requestId.toString()) });
  const acquisitionVolume = acquisitions.reduce((acc: bigint, acq: any) => acc + BigInt(acq.priceEscrowed), 0n);
  // The slice credited back to the purchaser as RIP buying power is netted out. It is emitted by
  // the rewards module in the allocation transaction.
  const acquisitionFees = acquisitionVolume - sumBy(slices, 2); // args.slice is shadowed by Array.prototype.slice
  dailyVolume.addGasToken(acquisitionVolume);
  dailyFees.addGasToken(acquisitionFees, METRICS.AcquisitionFees);

  // Every protocol accrual emits OwnerFeesAccrued in the transaction that produced it, so accruals
  // are attributed by the settlement or allocation event sharing their transaction hash. This
  // avoids reading fee rates that the owner can change.
  const txsOf = (logs: any[]) => new Set(logs.map((log: any) => log.transactionHash));
  const settlementTxs = txsOf([...nftKept, ...nftRelisted]);
  const discountedTxs = txsOf([...bidAccepted, ...bidAcceptedAsTokens]);
  let settlementFees = 0n;
  let retainedToProtocol = 0n;
  let acquisitionCut = 0n;
  ownerFees.forEach((log: any) => {
    const amount = BigInt(log.args.amount);
    if (settlementTxs.has(log.transactionHash)) settlementFees += amount;
    else if (discountedTxs.has(log.transactionHash)) retainedToProtocol += amount;
    else acquisitionCut += amount;
  });
  if (acquisitionCut > acquisitionFees) acquisitionCut = acquisitionFees;

  // Settlement fee when the backing returns to the depositor (purchaser keeps or relists).
  dailyFees.addGasToken(settlementFees, METRICS.SettlementFees);
  dailyRevenue.addGasToken(settlementFees, METRICS.SettlementFees);
  dailyProtocolRevenue.addGasToken(settlementFees, METRICS.SettlementFees);

  // Backing retained when the purchaser takes the discounted settlement instead of the basket.
  // Kept by the protocol by default; the remainder, if any, was shared among active depositors.
  const retained = sumBy(bidAccepted, 'retained') + sumBy(bidAcceptedAsTokens, 'retained');
  dailyFees.addGasToken(retained, METRICS.RetainedSettlements);
  dailyRevenue.addGasToken(retainedToProtocol, METRICS.RetainedSettlements);
  dailyProtocolRevenue.addGasToken(retainedToProtocol, METRICS.RetainedSettlements);
  if (retained > retainedToProtocol) dailySupplySideRevenue.addGasToken(retained - retainedToProtocol, METRICS.RetainedSettlements);

  // The protocol's cut of acquisition fees; the rest goes to depositors as a share to the
  // top-backed listing's pot and an equal split across active listings.
  dailyRevenue.addGasToken(acquisitionCut, METRICS.AcquisitionFees);
  dailyProtocolRevenue.addGasToken(acquisitionCut, METRICS.AcquisitionFees);
  const topListingShare = sumBy(topListingFunded, 'amount');
  let depositorShare = acquisitionFees - acquisitionCut - topListingShare;
  if (depositorShare < 0n) depositorShare = 0n;
  dailySupplySideRevenue.addGasToken(depositorShare, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(topListingShare, METRICS.TopListingReward);

  // Accrued protocol fees are paid out later; a protocolFeeToTokenBps slice can go to RIP buybacks
  // at that time. Recorded as holders revenue when the payout happens.
  feesToToken.forEach((log: any) => { dailyHoldersRevenue.addGasToken(log.args.amount, METRICS.TokenBuyBack); });

  // Hook swap fees. Sells pay in ETH (feeAmount0). Buys pay in RIP (feeAmount1), which the hook
  // swaps to ETH inside the same afterSwap call without emitting the amount, so it is valued at
  // the pool price on that swap's Trade event (currency0 = ETH, currency1 = RIP). A buy's Trade
  // is identified in the same transaction by its RIP output: the fee is a flat 1% of it.
  const buyTradesByTx = new Map<string, any[]>();
  trades.forEach((log: any) => {
    if (BigInt(log.args.tokenAmount) <= 0n) return;
    const list = buyTradesByTx.get(log.transactionHash) ?? [];
    list.push(log);
    buyTradesByTx.set(log.transactionHash, list);
  });
  let swapFees = 0n;
  hookFees.forEach((log: any) => {
    swapFees += BigInt(log.args.feeAmount0);
    const ripFee = BigInt(log.args.feeAmount1);
    if (ripFee === 0n) return;
    const candidates = buyTradesByTx.get(log.transactionHash) ?? [];
    const i = candidates.findIndex((t: any) => BigInt(t.args.tokenAmount) * HOOK_FEE_BIPS / BPS === ripFee);
    if (i < 0) return;
    const [trade] = candidates.splice(i, 1);
    const sqrtPriceX96 = BigInt(trade.args.sqrtPriceX96);
    swapFees += ripFee * Q192 / (sqrtPriceX96 * sqrtPriceX96);
  });
  dailyFees.addGasToken(swapFees, METRICS.SwapFees);
  dailyRevenue.addGasToken(swapFees, METRICS.SwapFees);
  dailyProtocolRevenue.addGasToken(swapFees, METRICS.SwapFees);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Gross ETH paid by purchasers for acquisitions (rips), excluding refunded, expired, or slippage-cancelled requests.",
  Fees: "Acquisition fees paid by basket purchasers (net of the slice credited back to them as RIP buying power), settlement fees and retained backing taken from listings, plus the 1% hook fee on every ETH/RIP swap.",
  Revenue: "The protocol's cut of acquisition and settlement fees, retained settlement penalties, and hook swap fees.",
  ProtocolRevenue: "Revenue paid to the protocol treasury.",
  HoldersRevenue: "Protocol fees diverted to RIP buybacks.",
  SupplySideRevenue: "Share of acquisition fees distributed to basket depositors (equal split across active listings plus the top-listing pot), plus retained settlement backing when it is configured to go to depositors instead of the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "ETH paid by purchasers to acquire a random basket from the pool, net of the slice credited back to the purchaser as RIP buying power.",
    [METRICS.SettlementFees]: "Fee on the listing backing, charged when a settlement returns the backing to the depositor (purchaser keeps or relists the basket).",
    [METRICS.RetainedSettlements]: "The share of the listing backing retained when a purchaser takes the discounted settlement instead of the basket.",
    [METRICS.SwapFees]: "1% hook fee on every ETH/RIP swap: taken in ETH on sells, and in RIP on buys, which the hook converts to ETH in the same transaction (valued at the swap's pool price).",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol cut of acquisition fees.",
    [METRICS.SettlementFees]: "Settlement fees accrue entirely to the protocol.",
    [METRICS.RetainedSettlements]: "Retained settlement backing kept by the protocol.",
    [METRICS.SwapFees]: "Hook swap fees accrue entirely to the protocol.",
  },
  ProtocolRevenue: {
    [METRICS.AcquisitionFees]: "Protocol cut of acquisition fees paid to the treasury.",
    [METRICS.SettlementFees]: "Settlement fees paid to the treasury.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties paid to the treasury.",
    [METRICS.SwapFees]: "Hook swap fees paid to the treasury.",
  },
  HoldersRevenue: {
    [METRICS.TokenBuyBack]: "Protocol fees diverted to RIP buybacks.",
  },
  SupplySideRevenue: {
    [METRICS.AcquisitionFees]: "Share of acquisition fees distributed to basket depositors, split equally across active listings.",
    [METRICS.TopListingReward]: "Share of acquisition fees accruing to the depositor of the top-backed listing.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties redistributed among active depositors when not routed to the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-26',
  methodology,
  breakdownMethodology,
};

export default adapter;
