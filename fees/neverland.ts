/**
 * Neverland fees & revenue adapter (Monad).
 *
 * Lending pool fees (borrow interest, flashloan premiums, liquidation bonuses)
 * are delegated to the shared Aave-V3 helper maintained by the DefiLlama team.
 *
 * This adapter adds Neverland-specific revenue streams on top:
 *   1. veDUST NFT sale royalties (MON / WMON received by ROYALTY_RECEIVER)
 *   2. Holders revenue — veDUST RevenueReward top-ups, Merkl DUST-LP incentives,
 *      and DUST buybacks routed through the Revenue wallet
 *
 * Revenue and ProtocolRevenue are intentionally identical: all protocol-collected
 * fees flow to the same Neverland treasury with no separate DAO split.
 */
import axios from "axios";
import { ethers } from "ethers";
import { Dependencies, type FetchOptions, type SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPoolFees, type AaveLendingPoolConfig } from "../helpers/aave";
import { getETHReceived, addTokensReceived, getEVMTokenTransfers } from "../helpers/token";
import { getAlliumChain, queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";

type Balances = ReturnType<FetchOptions["createBalances"]>;

// ---------------------------------------------------------------------------
// Contract addresses (Monad)
// ---------------------------------------------------------------------------

const LENDING_POOL: AaveLendingPoolConfig = {
  version: 3,
  lendingPoolProxy: "0x80F00661b13CC5F6ccd3885bE7b4C9c67545D585",
  dataProvider: "0xfd0b6b6F736376F7B99ee989c749007c7757fDba",
};

const DUST = "0xAD96C3dffCD6374294e2573A7fBBA96097CC8d7c";                    // DUST governance token
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";                    // bridged USDC on Monad
const NUSDC = "0x38648958836eA88b368b4ac23b86Ad44B0fe7508";                   // Neverland interest-bearing USDC (aToken)
const WMON = "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A";                    // wrapped MON
const DUST_LOCK = "0xBB4738D05AD1b3Da57a4881baE62Ce9bb1eEeD6C";               // veDUST locking contract
const DUST_REWARDS_CONTROLLER = "0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec"; // lending incentives controller
const REVENUE_REWARD = "0xff20ac10eb808B1e31F5CfCa58D80eDE2Ba71c43";          // weekly reward distributor for veDUST holders
const USER_VAULT_FACTORY = "0xe82f2fa836BC5DB42a36C66027c0113BcAA28143";      // vault factory (excluded from royalty senders)
const TEAM = "0x8D3e4D6188D207641E3d8f9c08e43956D4Daa66A";                    // team multisig
const REVENUE_WALLET = "0x909b176220b7e782C0f3cEccaB4b19D2c433c6BB";          // protocol revenue / buyback wallet
const ROYALTY_RECEIVER = "0x000012a6ec4bb0F2fcfF0440B7d80aD605700069";        // veDUST NFT sale royalties receiver

// Pre-lowercased addresses to avoid repeated .toLowerCase() across the file
const DUST_LC = DUST.toLowerCase();
const USDC_LC = USDC.toLowerCase();
const NUSDC_LC = NUSDC.toLowerCase();
const WMON_LC = WMON.toLowerCase();
const DUST_LOCK_LC = DUST_LOCK.toLowerCase();
const DUST_REWARDS_CONTROLLER_LC = DUST_REWARDS_CONTROLLER.toLowerCase();
const REVENUE_REWARD_LC = REVENUE_REWARD.toLowerCase();
const USER_VAULT_FACTORY_LC = USER_VAULT_FACTORY.toLowerCase();
const TEAM_LC = TEAM.toLowerCase();
const REVENUE_WALLET_LC = REVENUE_WALLET.toLowerCase();
const ROYALTY_RECEIVER_LC = ROYALTY_RECEIVER.toLowerCase();

// ---------------------------------------------------------------------------
// Numeric / timing constants
// ---------------------------------------------------------------------------

const MONAD_CHAIN_ID = 143;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Balance labels (shown in breakdown methodology)
// ---------------------------------------------------------------------------

const VEDUST_REWARDS_LABEL = "veDUST Revenue";
const DUST_LP_INCENTIVES_LABEL = "DUST LP Revenue";
const DUST_BUYBACKS_LABEL = "DUST Buybacks & Burns";
const ROYALTIES_LABEL = "veDUST Royalties";

const MERKL_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Accept": "application/json",
  "Origin": "https://app.merkl.xyz",
  "Referer": "https://app.merkl.xyz/",
};

// Wallets that legitimately create Merkl campaigns on behalf of the protocol
const controlledCampaignCreatorSet = new Set([TEAM_LC, REVENUE_WALLET_LC, ROYALTY_RECEIVER_LC]);

// Internal contracts whose transfers to the royalty receiver are NOT external royalty payments
const royaltyExcludedSenderSet = new Set([
  ethers.ZeroAddress,
  DUST_LC,
  DUST_LOCK_LC,
  DUST_REWARDS_CONTROLLER_LC,
  REVENUE_REWARD_LC,
  USER_VAULT_FACTORY_LC,
  TEAM_LC,
  REVENUE_WALLET_LC,
  ROYALTY_RECEIVER_LC,
]);

// ---------------------------------------------------------------------------
// Merkl API types
// ---------------------------------------------------------------------------

type MerklToken = {
  address?: string;
  type?: string;
};

type MerklOpportunity = {
  id: string | number;
  action?: string;
  tokens?: MerklToken[];
};

type MerklCampaignStatus = {
  status?: string;
};

type MerklCampaign = {
  amount?: string;
  opportunityId?: string | number;
  creatorAddress?: string;
  distributionChainId?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  rewardToken?: MerklToken;
  campaignStatus?: MerklCampaignStatus;
  createdAt?: string;
};

type TimestampedTransfer = {
  token?: string;
  amount?: string;
  timestamp?: string | number;
};

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

let merklCampaignsPromise: Promise<MerklCampaign[]> | undefined;

// nUSDC is the Neverland nToken for USDC; Merkl rewards denominated in nUSDC
// should be priced as USDC since they share the same underlying value.
const rewardTokenPriceAlias: Record<string, string> = {
  [NUSDC_LC]: USDC_LC,
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getLowerCaseAddress(address?: string) {
  return (address || "").toLowerCase();
}

/** Clamp-and-intersect: returns seconds of overlap between two time windows, or 0. */
function getWindowOverlap(startTimestamp: number, endTimestamp: number, distributionStart: number, distributionEnd: number) {
  return Math.max(0, Math.min(endTimestamp, distributionEnd) - Math.max(startTimestamp, distributionStart));
}

function parseUnixTimestamp(timestamp?: string | number) {
  if (timestamp === undefined || timestamp === null) return undefined;
  const parsed = typeof timestamp === "number" ? timestamp : Number(timestamp);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Attribute a fraction of `amount` to the current reporting window.
 *
 * Given a distribution that runs from `distributionStart` to `distributionEnd`,
 * we compute what share of that window overlaps with `options.startTimestamp ..
 * options.endTimestamp` and credit only the pro-rated portion to `balances`.
 */
function addProratedAmount(
  balances: Balances,
  token: string | undefined,
  amount: string | number | bigint | undefined,
  distributionStart: number,
  distributionEnd: number,
  options: FetchOptions,
  label: string,
) {
  if (!token || amount === undefined || amount === null) return;
  if (!Number.isFinite(distributionStart) || !Number.isFinite(distributionEnd)) return;

  const duration = distributionEnd - distributionStart;
  const overlap = getWindowOverlap(options.startTimestamp, options.endTimestamp, distributionStart, distributionEnd);
  if (duration <= 0 || overlap <= 0) return;

  const proratedAmount = BigInt(amount.toString()) * BigInt(overlap) / BigInt(duration);
  if (!proratedAmount) return;

  balances.add(token, proratedAmount.toString(), label);
}

// ---------------------------------------------------------------------------
// Allium query helpers
// ---------------------------------------------------------------------------

/** Fetch token transfers to `target` with a lookback window (default 7 days before the reporting window start). */
async function getTimestampedTokenTransfersToTarget(options: FetchOptions, target: string, lookbackSeconds = WEEK_SECONDS) {
  const lookbackStart = Math.max(0, options.startTimestamp - lookbackSeconds);
  const chain = getAlliumChain(options.chain);
  return queryAllium(`
    SELECT
      LOWER(token_address) AS token,
      TO_VARCHAR(raw_amount) AS amount,
      DATE_PART(EPOCH_SECOND, block_timestamp) AS timestamp
    FROM crosschain.assets.transfers
    WHERE chain = '${chain}'
      AND to_address = '${target.toLowerCase()}'
      AND raw_amount > 0
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${lookbackStart})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `) as Promise<TimestampedTransfer[]>;
}

// ---------------------------------------------------------------------------
// Merkl campaign helpers
// ---------------------------------------------------------------------------

async function getMerklPage<T>(path: string) {
  const { data } = await axios.get<T[]>(`https://api.merkl.xyz${path}`, {
    headers: MERKL_HEADERS,
  });
  return data;
}

async function getMerklPages<T>(pathPrefix: string) {
  const items: T[] = [];

  for (let page = 0; page < 20; page++) {
    const pageItems = await getMerklPage<T>(`${pathPrefix}&items=100&page=${page}`);
    if (!pageItems.length) break;
    items.push(...pageItems);
    if (pageItems.length < 100) break;
  }

  return items;
}

/**
 * Fetch and cache Merkl campaigns relevant to Neverland.
 *
 * The result is memoized in `merklCampaignsPromise` because the same campaign
 * set is needed by multiple revenue streams within a single adapter run.
 *
 * Filter criteria:
 *   - Opportunity must be a POOL action involving DUST
 *   - Campaign creator must be a known Neverland wallet
 *   - Distribution chain must be Monad
 *   - Reward token must not be a POINT and must have an address
 *   - Campaign must not be FAILED or INVALID
 */
async function getRelevantMerklCampaigns() {
  if (!merklCampaignsPromise) {
    merklCampaignsPromise = (async () => {
      const opportunities = await getMerklPages<MerklOpportunity>(`/v4/opportunities?chainId=${MONAD_CHAIN_ID}`);
      const relevantOpportunityIds = new Set(
        opportunities
          .filter((opportunity) =>
            opportunity.action === "POOL" &&
            (opportunity.tokens || []).some((token) => getLowerCaseAddress(token.address) === DUST_LC)
          )
          .map((opportunity) => String(opportunity.id))
      );

      const campaigns = await getMerklPages<MerklCampaign>(`/v4/campaigns?chainId=${MONAD_CHAIN_ID}`);
      return campaigns.filter((campaign) => {
        const creator = getLowerCaseAddress(campaign.creatorAddress);
        const rewardTokenType = campaign.rewardToken?.type;
        const rewardTokenAddress = campaign.rewardToken?.address;
        const status = campaign.campaignStatus?.status;

        if (!relevantOpportunityIds.has(String(campaign.opportunityId))) return false;
        if (!controlledCampaignCreatorSet.has(creator)) return false;
        if (campaign.distributionChainId !== MONAD_CHAIN_ID) return false;
        if (!rewardTokenAddress || rewardTokenType === "POINT") return false;
        if (status === "FAILED" || status === "INVALID") return false;

        return true;
      });
    })();
  }

  return merklCampaignsPromise;
}

// ---------------------------------------------------------------------------
// Revenue stream: veDUST holder distributions
// ---------------------------------------------------------------------------

/** RevenueReward funding transfers, pro-rated across the 7-day distribution window following each top-up. */
async function addVeDustRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const rewardTopUps = await getTimestampedTokenTransfersToTarget(options, REVENUE_REWARD);
  rewardTopUps.forEach((transfer) => {
    const timestamp = parseUnixTimestamp(transfer.timestamp);
    if (timestamp === undefined) return;
    addProratedAmount(
      dailyHoldersRevenue,
      transfer.token,
      transfer.amount,
      timestamp,
      timestamp + WEEK_SECONDS,
      options,
      VEDUST_REWARDS_LABEL,
    );
  });
}

/** Merkl campaign rewards for DUST liquidity pools, pro-rated across each campaign's active duration. */
async function addDustLpRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const campaigns = await getRelevantMerklCampaigns();

  campaigns.forEach((campaign) => {
    if (!campaign.rewardToken?.address || !campaign.amount) return;
    const distributionStart = parseUnixTimestamp(campaign.startTimestamp);
    const distributionEnd = parseUnixTimestamp(campaign.endTimestamp);
    if (distributionStart === undefined || distributionEnd === undefined) return;
    const rewardToken = rewardTokenPriceAlias[campaign.rewardToken.address.toLowerCase()] || campaign.rewardToken.address;

    addProratedAmount(
      dailyHoldersRevenue,
      rewardToken,
      campaign.amount,
      distributionStart,
      distributionEnd,
      options,
      DUST_LP_INCENTIVES_LABEL,
    );
  });
}

/** DUST tokens arriving at the Revenue wallet (buyback inventory), recognized on the day of receipt. */
async function addDustBuybackRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const dustReceipts = await getEVMTokenTransfers({
    options,
    toAddresses: [REVENUE_WALLET],
    tokens: [DUST],
  });

  dailyHoldersRevenue.addBalances(dustReceipts, DUST_BUYBACKS_LABEL);
}

// ---------------------------------------------------------------------------
// Revenue stream: veDUST sale royalties
// ---------------------------------------------------------------------------

/** Track MON and WMON royalties received by the dedicated royalty wallet from external senders. */
async function addRoyaltyReceipts(
  options: FetchOptions,
  dailyFees: Balances,
  dailyProtocolRevenue: Balances,
) {
  try {
    const royaltySenderAllowFilter = (log: { from?: string; from_address?: string }) => {
      const from = getLowerCaseAddress(log.from || log.from_address);
      return !!from && !royaltyExcludedSenderSet.has(from);
    };

    const royaltyReceipts = await getETHReceived({
      options,
      target: ROYALTY_RECEIVER,
      notFromSenders: Array.from(royaltyExcludedSenderSet),
    });
    const wrappedRoyaltyReceipts = await addTokensReceived({
      options,
      target: ROYALTY_RECEIVER,
      tokens: [WMON_LC],
      logFilter: royaltySenderAllowFilter,
    });

    for (const receipts of [royaltyReceipts, wrappedRoyaltyReceipts]) {
      dailyFees.addBalances(receipts, ROYALTIES_LABEL);
      dailyProtocolRevenue.addBalances(receipts, ROYALTIES_LABEL);
    }
  } catch (error: any) {
    console.error("neverland: failed to fetch royalty receipts", error?.message || error);
  }
}

// ---------------------------------------------------------------------------
// Main fetch
// ---------------------------------------------------------------------------

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Lending pool fees (borrow interest, flashloans, liquidations) via the
  // shared DefiLlama Aave-V3 helper
  await getPoolFees(LENDING_POOL, options, {
    dailyFees,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  });

  // Neverland-specific revenue streams
  await Promise.all([
    addRoyaltyReceipts(options, dailyFees, dailyProtocolRevenue),
    addVeDustRevenue(options, dailyHoldersRevenue),
    addDustLpRevenue(options, dailyHoldersRevenue),
    addDustBuybackRevenue(options, dailyHoldersRevenue),
  ]);

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
// Methodology — Revenue and ProtocolRevenue share the same descriptions
// because all protocol-collected fees flow to a single Neverland treasury.
// ---------------------------------------------------------------------------

const protocolRevenueMethodology = "Protocol revenue collected by Neverland when lending fees or veDUST sale royalties in MON or WMON are earned.";

const protocolRevenueBreakdown = {
  [METRIC.BORROW_INTEREST]: "The protocol share of borrower interest collected by Neverland.",
  [METRIC.LIQUIDATION_FEES]: "The protocol share of liquidation value collected by Neverland.",
  [METRIC.FLASHLOAN_FEES]: "The protocol share of flashloan fees collected by Neverland.",
  [ROYALTIES_LABEL]: "veDUST sale royalty receipts in MON or WMON collected by Neverland.",
};

const methodology = {
  Fees: "Borrow interest, flashloan fees, liquidation fees, and veDUST sale royalties collected by the dedicated royalty wallet in MON or WMON.",
  Revenue: protocolRevenueMethodology,
  SupplySideRevenue: "Borrow interest and liquidation value distributed to lenders.",
  ProtocolRevenue: protocolRevenueMethodology,
  HoldersRevenue: "Community-directed distributions only. Revenue contract funding transfers are recognized across the following 7 days, Merkl DUST liquidity incentives are recognized across each campaign's active period, and DUST buyback inventory is recognized when DUST reaches Neverland's Revenue wallet for final burn/value-accrual handling. DUST LP incentives are intentionally classified as holders revenue because they support DUST token value accrual and liquidity depth.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "All interest paid by borrowers across Neverland lending markets.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties and bonuses paid during liquidations.",
    [METRIC.FLASHLOAN_FEES]: "Flashloan fees paid by flashloan borrowers and executors.",
    [ROYALTIES_LABEL]: "veDUST sale royalty receipts collected by Neverland's dedicated royalty wallet in MON or WMON.",
  },
  Revenue: protocolRevenueBreakdown,
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Borrow interest distributed to lenders.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation value distributed to lenders and liquidators.",
    [METRIC.FLASHLOAN_FEES]: "Flashloan fees distributed to lenders through pool accounting.",
  },
  ProtocolRevenue: protocolRevenueBreakdown,
  HoldersRevenue: {
    [VEDUST_REWARDS_LABEL]: "Revenue contract funding transfers for veDUST holders, recognized ratably across the 7 days epoch of each funding transfer.",
    [DUST_LP_INCENTIVES_LABEL]: "Neverland-controlled Merkl campaigns for DUST liquidity opportunities on Monad, recognized ratably across each campaign's active epoch.",
    [DUST_BUYBACKS_LABEL]: "All DUST collected by Neverland's Revenue wallet recognized on the day the DUST reaches the Revenue wallet for final burn/value-accrual handling.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  chains: [CHAIN.MONAD],
  fetch,
  start: "2025-11-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
