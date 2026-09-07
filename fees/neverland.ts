/**
 * Neverland fees & revenue adapter (Monad).
 *
 * Lending pool fees (borrow interest, flashloan premiums, liquidation bonuses)
 * are delegated to the shared Aave-V3 helper maintained by the DefiLlama team.
 *
 * This adapter adds Neverland-specific revenue streams on top:
 *   1. veDUST NFT sale royalties (MON / WMON received by ROYALTY_RECEIVER)
 *   2. Holder allocations — veDUST RevenueReward top-ups and DUST buybacks
 *      routed through the Revenue wallet
 *
 * Revenue and ProtocolRevenue are intentionally identical: both report fees
 * collected into the Neverland treasury before governance allocations.
 */
import { ethers } from "ethers";
import { type FetchOptions, type SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPoolFees, type AaveLendingPoolConfig } from "../helpers/aave";
import { nullAddress } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Balances = ReturnType<FetchOptions["createBalances"]>;

// ---------------------------------------------------------------------------
// Addresses & constants
// ---------------------------------------------------------------------------

const LENDING_POOL: AaveLendingPoolConfig = {
  version: 3,
  lendingPoolProxy: "0x80F00661b13CC5F6ccd3885bE7b4C9c67545D585",
  dataProvider: "0xfd0b6b6F736376F7B99ee989c749007c7757fDba",
};

const ADDR = {
  dust: "0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c",
  usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  wmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
  revenueReward: "0xff20ac10eb808B1e31F5CfCa58D80eDE2Ba71c43",
  revenueWallet: "0x909b176220b7e782C0f3cEccaB4b19D2c433c6BB",
  royaltyReceiver: "0x000012a6ec4bb0F2fcfF0440B7d80aD605700069",
  opensea: "0x0000000000000068F116a894984e2DB1123eB395",
} as const;

// Pre-lowercased mirror of ADDR for topic/log comparisons.
const LC = Object.fromEntries(
  Object.entries(ADDR).map(([k, v]) => [k, v.toLowerCase()])
) as { [K in keyof typeof ADDR]: string };

const VEDUST_REWARDS_LABEL = "veDUST Revenue";
const DUST_BUYBACKS_LABEL = "DUST Buybacks & Burns";
const ROYALTIES_LABEL = "veDUST Royalties";
const OPENSEA_ORDER_FULFILLED_TOPIC = ethers.id("OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])");

// ---------------------------------------------------------------------------
// ABI interfaces & event topics
// ---------------------------------------------------------------------------

const ZERO_ADDRESS_LC = ethers.ZeroAddress.toLowerCase();

const IFACE = {
  revenueReward: new ethers.Interface([
    "event NotifyReward(address indexed from,address indexed token,uint256 epoch,uint256 amount)",
  ]),
  opensea: new ethers.Interface([
    "event OrderFulfilled(bytes32 orderHash,address indexed offerer,address indexed zone,address recipient,(uint8 itemType,address token,uint256 identifier,uint256 amount)[] offer,(uint8 itemType,address token,uint256 identifier,uint256 amount,address recipient)[] consideration)",
  ]),
  erc20: new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ]),
};

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const lc = (address?: string | null) => (address || "").toLowerCase();

// Attribute an OpenSea OrderFulfilled consideration item to royalties if sent to our receiver.
function addOpenSeaRoyaltyConsideration(
  consideration: { token: string; amount: bigint; recipient: string },
  ...balances: Balances[]
) {
  if (lc(consideration.recipient) !== LC.royaltyReceiver) return;

  // Royalties are settled in native MON or (rarely) WMON only.
  const tokenLc = lc(consideration.token);
  const resolvedToken =
    tokenLc === ZERO_ADDRESS_LC ? nullAddress :
      tokenLc === LC.wmon ? ADDR.wmon : undefined;
  if (!resolvedToken) return;

  for (const b of balances) b.add(resolvedToken, consideration.amount.toString(), ROYALTIES_LABEL);
}

// ---------------------------------------------------------------------------
// Revenue surfaces
// ---------------------------------------------------------------------------

// USDC revenue distributions to veDUST holders, recognized when notified on-chain.
async function addVeDustRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const rewardNotifications = await options.getLogs({
    target: ADDR.revenueReward,
    eventAbi: IFACE.revenueReward.getEvent("NotifyReward")!.format("full"),
  });

  rewardNotifications
    .filter((log: any) => lc(log.from) === LC.revenueWallet && lc(log.token) === LC.usdc)
    .forEach((log: any) => dailyHoldersRevenue.add(ADDR.usdc, log.amount, VEDUST_REWARDS_LABEL));
}

/**
 * DUST accrued by the Revenue wallet for burn, recognized on the day of receipt.
 * Includes royalty-funded buybacks once the DUST reaches the Revenue wallet.
 * Defensive: topic[2] filtering on `to` returned false negatives for known txs
 * across multiple test days, so we fetch all DUST Transfers and filter in code.
 */
async function addDustBuybackRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const dustTransfers = await options.getLogs({
    target: ADDR.dust,
    eventAbi: IFACE.erc20.getEvent("Transfer")!.format("full"),
  });

  dustTransfers
    .filter((log: any) => lc(log.to) === LC.revenueWallet)
    .forEach((log: any) => dailyHoldersRevenue.add(ADDR.dust, log.value, DUST_BUYBACKS_LABEL));
}

// veDUST NFT sale royalties collected in MON/WMON via OpenSea OrderFulfilled events.
async function addRoyaltyReceipts(
  options: FetchOptions,
  dailyFees: Balances,
  dailyProtocolRevenue: Balances,
) {
  const logs = await options.getLogs({
    target: ADDR.opensea,
    topics: [OPENSEA_ORDER_FULFILLED_TOPIC],
    fromBlock: await options.getStartBlock(),
    toBlock: await options.getEndBlock(),
    entireLog: true,
  });

  logs.forEach((log: any) => {
    const parsed = IFACE.opensea.parseLog(log);
    if (!parsed) return;
    parsed.args.consideration.forEach((consideration: any) => addOpenSeaRoyaltyConsideration(consideration, dailyFees, dailyProtocolRevenue));
  });
}

// ---------------------------------------------------------------------------
// Main fetch
// ---------------------------------------------------------------------------

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  await getPoolFees(LENDING_POOL, options, {
    dailyFees,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  });

  await Promise.all([
    addRoyaltyReceipts(options, dailyFees, dailyProtocolRevenue),
    addVeDustRevenue(options, dailyHoldersRevenue),
    addDustBuybackRevenue(options, dailyHoldersRevenue),
  ]);

  // Revenue = protocol revenue only; holders revenue is reported separately (matches Aave V3 convention).
  const dailyRevenue = dailyProtocolRevenue.clone();

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

// ---------------------------------------------------------------------------
// Methodology
// ---------------------------------------------------------------------------

const protocolRevenueMethodology = "Revenue retained by the Neverland protocol from lending operations and veDUST NFT sale royalties.";

const protocolRevenueBreakdown = {
  [METRIC.BORROW_INTEREST]: "Neverland's share of borrower interest, determined by each market's reserve factor.",
  [METRIC.LIQUIDATION_FEES]: "Neverland's share of liquidation bonuses collected during position liquidations.",
  [METRIC.FLASHLOAN_FEES]: "Neverland's share of premiums charged on flashloan executions.",
  [ROYALTIES_LABEL]: "Royalties on veDUST NFT sales.",
};

const methodology = {
  Fees: "All fees generated by the protocol: borrower interest across lending markets, flashloan premiums, liquidation penalties, and veDUST NFT sale royalties.",
  Revenue: protocolRevenueMethodology,
  SupplySideRevenue: "Borrower interest and liquidation proceeds distributed to liquidity providers. The lender share of flashloan premiums is included here as it accrues through the lending pool's liquidity index.",
  ProtocolRevenue: protocolRevenueMethodology,
  HoldersRevenue: "Governance-directed revenue sharing. veDUST revenue distributions are recognized when notified on-chain and DUST buybacks on the day they reach Neverland's Revenue wallet.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Total interest paid by borrowers across all Neverland lending markets.",
    [METRIC.LIQUIDATION_FEES]: "Penalties and bonuses paid during position liquidations.",
    [METRIC.FLASHLOAN_FEES]: "Neverland's treasury share of premiums charged on flashloan executions.",
    [ROYALTIES_LABEL]: protocolRevenueBreakdown[ROYALTIES_LABEL],
  },
  Revenue: protocolRevenueBreakdown,
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Borrower interest distributed to lenders. Also captures the lender share of flashloan premiums, which accrues through the lending pool's liquidity index.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation proceeds distributed to lenders and liquidators.",
  },
  ProtocolRevenue: protocolRevenueBreakdown,
  HoldersRevenue: {
    [VEDUST_REWARDS_LABEL]: "USDC revenue sharing to veDUST holders, recognized when the RevenueReward contract emits NotifyReward.",
    [DUST_BUYBACKS_LABEL]: "DUST accrued by the Revenue wallet for burn, recognized on the day of receipt.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2025-11-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
