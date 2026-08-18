import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ChainApi } from "@defillama/sdk";

// StockRip: depositors list a basket NFT (tokenized stocks) with ETH backing, purchasers pay an
// acquisition fee to be allocated one at random, then keep it, relist it, or take a discounted
// settlement of its backing.
const CORE = "0x32E8D5b0b8643dC002864a2F5e4481E59eb714CB";
// Uniswap v4 hook on the ETH/RIP pool: 1% fee on every swap, paid to the protocol treasury
const HOOK = "0xf295127365a2C3055FdfBa01b0596dA56DCFa444";
const BPS = 10_000n;
const Q192 = 1n << 192n;

const METRICS = {
  AcquisitionFees: 'Acquisition Fees',
  SettlementFees: 'Settlement Fees',
  RetainedSettlements: 'Retained Settlement Penalties',
  TopListingReward: 'Top Listing Reward',
  SwapFees: 'Swap Fees',
  TokenBuyBack: 'RIP Buyback',
};

const ABIS = {
  NFTAllocated: "event NFTAllocated(uint256 indexed requestId, uint256 indexed listingId, address indexed purchaser, address depositor, uint256 value, uint256 randomWord)",
  TopListingFunded: "event TopListingFunded(uint256 indexed listingId, uint256 amount, uint256 newPot)",
  NFTKept: "event NFTKept(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 backing)",
  NFTRelisted: "event NFTRelisted(uint256 indexed listingId, uint256 indexed newListingId, uint256 toDepositor)",
  DepositorBidAccepted: "event DepositorBidAccepted(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 payout, uint256 retained)",
  DepositorBidAcceptedAsTokens: "event DepositorBidAcceptedAsTokens(uint256 indexed listingId, address indexed purchaser, address indexed depositor, uint256 ethPayout, uint256 retained, uint256 tokenOut)",
  OwnerFeesAccrued: "event OwnerFeesAccrued(uint256 amount)",
  ProtocolFeesToToken: "event ProtocolFeesToToken(uint256 amount)",
  HookFee: "event HookFee(bytes32 indexed id, address indexed sender, uint128 feeAmount0, uint128 feeAmount1)",
  Trade: "event Trade(uint160 sqrtPriceX96, int128 ethAmount, int128 tokenAmount)",
  acquisitions: "function acquisitions(uint256) view returns (address purchaser, uint256 requestBlock, uint256 priceEscrowed, uint256 listingId, uint8 status)",
  acquisitionTokenSlice: "function acquisitionTokenSlice(uint256) view returns (uint256)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [allocated, topListingFunded, nftKept, nftRelisted, bidAccepted, bidAcceptedAsTokens, ownerFees, feesToToken, hookFees, trades] = await Promise.all([
    options.getLogs({ target: CORE, eventAbi: ABIS.NFTAllocated }),
    options.getLogs({ target: CORE, eventAbi: ABIS.TopListingFunded }),
    options.getLogs({ target: CORE, eventAbi: ABIS.NFTKept }),
    options.getLogs({ target: CORE, eventAbi: ABIS.NFTRelisted }),
    options.getLogs({ target: CORE, eventAbi: ABIS.DepositorBidAccepted }),
    options.getLogs({ target: CORE, eventAbi: ABIS.DepositorBidAcceptedAsTokens }),
    options.getLogs({ target: CORE, eventAbi: ABIS.OwnerFeesAccrued }),
    options.getLogs({ target: CORE, eventAbi: ABIS.ProtocolFeesToToken }),
    options.getLogs({ target: HOOK, eventAbi: ABIS.HookFee, onlyArgs: false }),
    options.getLogs({ target: HOOK, eventAbi: ABIS.Trade, onlyArgs: false }),
  ]);

  // Robinhood Chain's public RPC is not an archive node, so state is read at the latest block.
  // Acquisition records are immutable once written and the fee config has not changed since launch.
  const api = new ChainApi({ chain: options.chain });
  const [ownerSettlementFeeBps, retainedToProtocol] = await Promise.all([
    api.call({ target: CORE, abi: 'uint256:ownerSettlementFeeBps' }),
    api.call({ target: CORE, abi: 'bool:retainedToProtocol' }),
  ]);

  // Acquisition fees are booked when the request is allocated. NFTAllocated does not carry the
  // fee, so the escrowed price and the purchaser's RIP slice are read back per request id.
  // Refunded, expired and slippage-cancelled requests never allocate, so they are excluded.
  const requestIds = allocated.map((log: any) => log.requestId.toString());
  const [acquisitions, slices] = await Promise.all([
    api.multiCall({ abi: ABIS.acquisitions, target: CORE, calls: requestIds }),
    api.multiCall({ abi: ABIS.acquisitionTokenSlice, target: CORE, calls: requestIds }),
  ]);
  let acquisitionVolume = 0n;
  let acquisitionFees = 0n;
  acquisitions.forEach((acq: any, i: number) => {
    const price = BigInt(acq.priceEscrowed);
    acquisitionVolume += price;
    // The slice credited back to the purchaser as RIP buying power is netted out.
    acquisitionFees += price - BigInt(slices[i]);
  });
  dailyVolume.addGasToken(acquisitionVolume);
  dailyFees.addGasToken(acquisitionFees, METRICS.AcquisitionFees);

  // Settlement fee when the backing returns to the depositor (purchaser keeps or relists):
  // the events carry the depositor payout net of the cut, so gross the fee back up.
  const settleBps = BigInt(ownerSettlementFeeBps);
  let settlementFees = 0n;
  nftKept.forEach((log: any) => { settlementFees += BigInt(log.backing) * settleBps / (BPS - settleBps); });
  nftRelisted.forEach((log: any) => { settlementFees += BigInt(log.toDepositor) * settleBps / (BPS - settleBps); });
  dailyFees.addGasToken(settlementFees, METRICS.SettlementFees);

  // Backing retained when the purchaser takes the discounted settlement instead of the basket.
  // Protocol revenue when retainedToProtocol, otherwise shared among active depositors.
  let retained = 0n;
  bidAccepted.forEach((log: any) => { retained += BigInt(log.retained); });
  bidAcceptedAsTokens.forEach((log: any) => { retained += BigInt(log.retained); });
  dailyFees.addGasToken(retained, METRICS.RetainedSettlements);
  if (!retainedToProtocol) dailySupplySideRevenue.addGasToken(retained, METRICS.RetainedSettlements);

  // OwnerFeesAccrued covers every protocol accrual, so the protocol's cut of acquisition fees is
  // what remains after the settlement-side accruals above.
  let totalOwnerFees = 0n;
  ownerFees.forEach((log: any) => { totalOwnerFees += BigInt(log.amount); });
  let acquisitionCut = totalOwnerFees - settlementFees - (retainedToProtocol ? retained : 0n);
  if (acquisitionCut < 0n) acquisitionCut = 0n;
  if (acquisitionCut > acquisitionFees) acquisitionCut = acquisitionFees;

  // The rest of the acquisition fee goes to depositors: a share to the top-backed listing's pot,
  // the remainder split equally across active listings.
  let topListingShare = 0n;
  topListingFunded.forEach((log: any) => { topListingShare += BigInt(log.amount); });
  let depositorShare = acquisitionFees - acquisitionCut - topListingShare;
  if (depositorShare < 0n) depositorShare = 0n;
  dailySupplySideRevenue.addGasToken(depositorShare, METRICS.AcquisitionFees);
  dailySupplySideRevenue.addGasToken(topListingShare, METRICS.TopListingReward);

  // A protocolFeeToTokenBps slice of the protocol take can go to RIP buybacks at payout time
  // (holders revenue); the rest is paid to the treasury.
  const protocolTake = acquisitionCut + settlementFees + (retainedToProtocol ? retained : 0n);
  let toTokenBuyback = 0n;
  feesToToken.forEach((log: any) => { toTokenBuyback += BigInt(log.amount); });
  if (toTokenBuyback > protocolTake) toTokenBuyback = protocolTake;
  const treasuryShare = protocolTake - toTokenBuyback;
  const proRata = (amount: bigint, share: bigint) => protocolTake > 0n ? amount * share / protocolTake : 0n;
  const components: [bigint, string][] = [
    [acquisitionCut, METRICS.AcquisitionFees],
    [settlementFees, METRICS.SettlementFees],
    [retainedToProtocol ? retained : 0n, METRICS.RetainedSettlements],
  ];
  components.forEach(([amount, label]) => {
    dailyRevenue.addGasToken(amount, label);
    dailyProtocolRevenue.addGasToken(proRata(amount, treasuryShare), label);
  });
  dailyHoldersRevenue.addGasToken(toTokenBuyback, METRICS.TokenBuyBack);

  // Hook swap fees. Sells pay in ETH (feeAmount0). Buys pay in RIP (feeAmount1), which the hook
  // swaps to ETH in the same transaction without emitting the amount, so it is valued at the pool
  // price on the swap's Trade event (currency0 = ETH, currency1 = RIP).
  const tradesByTx = new Map<string, any[]>();
  trades.forEach((log: any) => {
    const list = tradesByTx.get(log.transactionHash) ?? [];
    list.push(log);
    tradesByTx.set(log.transactionHash, list);
  });
  let swapFees = 0n;
  hookFees.forEach((log: any) => {
    swapFees += BigInt(log.args.feeAmount0);
    const ripFee = BigInt(log.args.feeAmount1);
    if (ripFee === 0n) return;
    const trade = (tradesByTx.get(log.transactionHash) ?? []).find((t: any) => Number(t.logIndex) > Number(log.logIndex));
    if (!trade) return;
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
  Fees: "Acquisition fees paid by basket purchasers (net of the slice returned to them as RIP buying power), settlement fees and retained penalties taken from listing backings, plus the 1% hook fee on every ETH/RIP swap.",
  Revenue: "The protocol's cut of acquisition and settlement fees, retained settlement penalties, and hook swap fees.",
  ProtocolRevenue: "Revenue paid to the protocol treasury.",
  HoldersRevenue: "Protocol fees diverted to RIP buybacks.",
  SupplySideRevenue: "Share of acquisition fees distributed to basket depositors (equal split across active listings plus the top-listing pot).",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.AcquisitionFees]: "ETH paid by purchasers to acquire a random basket from the pool, net of the slice credited back to the purchaser as RIP buying power.",
    [METRICS.SettlementFees]: "1% of the listing backing, charged when a settlement returns the backing to the depositor (purchaser keeps or relists the basket).",
    [METRICS.RetainedSettlements]: "The share of the listing backing retained when a purchaser takes the discounted settlement instead of the basket.",
    [METRICS.SwapFees]: "1% hook fee on every ETH/RIP swap: taken in ETH on sells, and in RIP on buys, which the hook converts to ETH in the same transaction (valued at the swap's pool price).",
  },
  Revenue: {
    [METRICS.AcquisitionFees]: "Protocol cut (1%) of acquisition fees.",
    [METRICS.SettlementFees]: "Settlement fees accrue entirely to the protocol.",
    [METRICS.RetainedSettlements]: "Retained settlement penalties accrue to the protocol.",
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
