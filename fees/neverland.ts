/**
 * Neverland fees & revenue adapter (Monad).
 *
 * Lending pool fees (borrow interest, flashloan premiums, liquidation bonuses)
 * are delegated to the shared Aave-V3 helper maintained by the DefiLlama team.
 *
 * This adapter adds Neverland-specific revenue streams on top:
 *   1. veDUST NFT sale royalties (MON / WMON received by ROYALTY_RECEIVER)
 *   2. Holders revenue — veDUST RevenueReward top-ups, Merkl DUST-LP revenue,
 *      and DUST buybacks routed through the Revenue wallet
 *
 * Revenue and ProtocolRevenue are intentionally identical: all protocol-collected
 * fees flow to the same Neverland treasury with no separate DAO split.
 */
import { ethers } from "ethers";
import { type FetchOptions, type SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPoolFees, type AaveLendingPoolConfig } from "../helpers/aave";
import { getTransactions } from "../helpers/getTxReceipts";
import { nullAddress } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Balances = ReturnType<FetchOptions["createBalances"]>;

type DecodedMerklCampaign = {
  rewardToken: string;
  startTimestamp: number;
  duration: number;
};

type SignedTransaction = NonNullable<Awaited<ReturnType<typeof getTransactions>>[number]> & {
  hash: string;
};

type DecodableTransaction = {
  to?: string | null;
  data?: string;
  input?: string;
  value?: bigint;
};

type FundingTransfer = {
  amount: bigint;
  blockNumber: number;
  transactionHash: string;
};

type RevenueRewardNotification = {
  token: string;
  amount: bigint;
};

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
  nUsdc: "0x38648958836eA88b368b4ac23b86Ad44B0fe7508",
  wmon: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A",
  revenueReward: "0xff20ac10eb808B1e31F5CfCa58D80eDE2Ba71c43",
  revenueWallet: "0x909b176220b7e782C0f3cEccaB4b19D2c433c6BB",
  royaltyReceiver: "0x000012a6ec4bb0F2fcfF0440B7d80aD605700069",
  opensea: "0x0000000000000068F116a894984e2DB1123eB395",
  merklCreator: "0x8BB4C975Ff3c250e0ceEA271728547f3802B36Fd",
  merklCore: "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae",
} as const;

// Pre-lowercased mirror of ADDR for topic/log comparisons.
const LC = Object.fromEntries(
  Object.entries(ADDR).map(([k, v]) => [k, v.toLowerCase()])
) as { [K in keyof typeof ADDR]: string };

const WEEK_SECONDS = 7 * 24 * 60 * 60;
// +1 day buffer covers the Wednesday weight-decision window; campaigns are always 7 days.
const MERKL_LOOKBACK_SECONDS = WEEK_SECONDS + 24 * 60 * 60;

const VEDUST_REWARDS_LABEL = "veDUST Revenue";
const DUST_LP_INCENTIVES_LABEL = "DUST LP Revenue";
const DUST_BUYBACKS_LABEL = "DUST Buybacks & Burns";
const ROYALTIES_LABEL = "veDUST Royalties";
const REVENUE_REWARD_CACHE_KEY = "neverland-revenue-reward";
const MERKL_CACHE_KEY = "neverland-merkl-funding";
// Map Neverland Interest Bearing USDC (nUSDC) to its underlying for price resolution.
const REWARD_TOKEN_PRICE_ALIAS: Record<string, string> = {
  [LC.nUsdc]: ADDR.usdc,
};
const OPENSEA_ORDER_FULFILLED_TOPIC = ethers.id("OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])");

// ---------------------------------------------------------------------------
// ABI interfaces & event topics
// ---------------------------------------------------------------------------

const ERC20_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const ZERO_ADDRESS_LC = ethers.ZeroAddress.toLowerCase();

const IFACE = {
  safe: new ethers.Interface([
    "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures)",
  ]),
  multiSend: new ethers.Interface([
    "function multiSend(bytes transactions)",
  ]),
  revenueReward: new ethers.Interface([
    "function notifyRewardAmount(address token,uint256 amount)",
  ]),
  opensea: new ethers.Interface([
    "event OrderFulfilled(bytes32 orderHash,address indexed offerer,address indexed zone,address recipient,(uint8 itemType,address token,uint256 identifier,uint256 amount)[] offer,(uint8 itemType,address token,uint256 identifier,uint256 amount,address recipient)[] consideration)",
  ]),
  merklCreator: new ethers.Interface([
    "function createCampaign((bytes32 campaignId,address creator,address rewardToken,uint256 amount,uint32 campaignType,uint32 startTimestamp,uint32 duration,bytes campaignData))",
  ]),
  erc20: new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ]),
};

const MULTISEND_SELECTOR = IFACE.multiSend.getFunction("multiSend")!.selector;
const NOTIFY_REWARD_SELECTOR = IFACE.revenueReward.getFunction("notifyRewardAmount")!.selector;
const CREATE_CAMPAIGN_SELECTOR = IFACE.merklCreator.getFunction("createCampaign")!.selector;

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

const lc = (address?: string | null) => (address || "").toLowerCase();

function getWindowOverlap(startTimestamp: number, endTimestamp: number, distributionStart: number, distributionEnd: number) {
  return Math.max(0, Math.min(endTimestamp, distributionEnd) - Math.max(startTimestamp, distributionStart));
}

// Decode the packed encoding used by Safe's MultiSend contract.
function parseMultiSendTransactions(data: string) {
  const transactionsHex = data.startsWith("0x") ? data.slice(2) : data;
  const transactions: { to: string; data: string }[] = [];
  let offset = 0;

  while (offset < transactionsHex.length) {
    offset += 2;
    const to = `0x${transactionsHex.slice(offset, offset + 40)}`;
    offset += 40;
    offset += 64;

    const dataLength = Number(BigInt(`0x${transactionsHex.slice(offset, offset + 64)}`));
    offset += 64;

    const callData = `0x${transactionsHex.slice(offset, offset + dataLength * 2)}`;
    offset += dataLength * 2;
    transactions.push({ to, data: callData });
  }

  return transactions;
}

function decodeMerklCampaignCall(data?: string) {
  if (!data?.startsWith(CREATE_CAMPAIGN_SELECTOR)) return;
  const decoded = IFACE.merklCreator.decodeFunctionData("createCampaign", data)[0];
  return {
    rewardToken: decoded.rewardToken,
    startTimestamp: Number(decoded.startTimestamp),
    duration: Number(decoded.duration),
  } satisfies DecodedMerklCampaign;
}

function decodeRevenueRewardCall(data?: string) {
  if (!data?.startsWith(NOTIFY_REWARD_SELECTOR)) return;
  const [token, amount] = IFACE.revenueReward.decodeFunctionData("notifyRewardAmount", data);
  return {
    token,
    amount,
  } satisfies RevenueRewardNotification;
}

// Unwrap Safe execTransaction > MultiSend layers to extract calldatas targeting a specific address.
function getTargetCallDatasFromTransaction(tx: DecodableTransaction, targetLc: string) {
  const txTo = lc(tx.to);
  const input = tx.data || tx.input;
  if (!input) return [] as string[];
  if (txTo === targetLc) return [input];

  try {
    const parsedSafeTx = IFACE.safe.parseTransaction({ data: input, value: tx.value || 0n });
    if (!parsedSafeTx) return [] as string[];

    const innerTo = lc(parsedSafeTx.args.to);
    const innerData = parsedSafeTx.args.data;
    if (innerTo === targetLc) return [innerData];
    if (!innerData.startsWith(MULTISEND_SELECTOR)) return [] as string[];

    const [multiSendPayload] = IFACE.multiSend.decodeFunctionData("multiSend", innerData);
    return parseMultiSendTransactions(multiSendPayload)
      .filter((innerTx) => lc(innerTx.to) === targetLc)
      .map((innerTx) => innerTx.data);
  } catch {
    return [] as string[];
  }
}

function decodeAllTargetCallsFromTransaction<T>(
  tx: DecodableTransaction,
  targetLc: string,
  decodeCall: (data?: string) => T | undefined,
): T[] {
  return getTargetCallDatasFromTransaction(tx, targetLc)
    .map(decodeCall)
    .filter((decoded): decoded is T => decoded !== undefined);
}

// Recognize the portion of a distribution that overlaps with the query window.
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

// Fetch ERC-20 Transfer logs between a source and sink within a lookback window.
async function getFundingTransfers(options: FetchOptions, config: {
  fundingToken: string;
  source: string;
  sink: string;
  lookbackSeconds: number;
}) {
  const fromBlock = await options.getBlock(Math.max(0, options.startTimestamp - config.lookbackSeconds), options.chain, {});
  const toBlock = await options.getEndBlock();
  const logs = await options.getLogs({
    target: config.fundingToken,
    topics: [
      ERC20_TRANSFER_TOPIC,
      ethers.zeroPadValue(config.source, 32),
      ethers.zeroPadValue(config.sink, 32),
    ],
    fromBlock,
    toBlock,
    entireLog: true,
  });

  return logs.map((log: { data: string; blockNumber: number | string; transactionHash: string }) => ({
    amount: BigInt(log.data),
    blockNumber: Number(log.blockNumber),
    transactionHash: log.transactionHash.toLowerCase(),
  })) satisfies FundingTransfer[];
}

async function getTransactionsByHash(options: FetchOptions, txHashes: string[], cacheKey: string) {
  const uniqueTxHashes = [...new Set(txHashes)];
  if (!uniqueTxHashes.length) return new Map<string, SignedTransaction>();

  const txs = await getTransactions(options.chain, uniqueTxHashes, { cacheKey });
  return new Map(
    txs
      .filter((tx): tx is SignedTransaction => !!tx?.hash)
      .map((tx) => [tx.hash.toLowerCase(), tx])
  );
}

async function getBlockTimestamps(options: FetchOptions, blockNumbers: number[]) {
  const uniqueBlockNumbers = [...new Set(blockNumbers)];
  const blocks = await Promise.all(uniqueBlockNumbers.map((blockNumber) => options.api.provider.getBlock(blockNumber)));
  return new Map<number, number>(
    blocks
      .filter((block): block is NonNullable<typeof block> => !!block?.timestamp)
      .map((block) => [Number(block.number), Number(block.timestamp)])
  );
}

// End-to-end pipeline: find funding transfers, fetch their txs, and decode the target call in each.
async function getDecodedFundingTransfers<TDecoded>(
  options: FetchOptions,
  config: {
    fundingToken: string;
    source: string;
    sink: string;
    lookbackSeconds: number;
    cacheKey: string;
    targetLc: string;
  },
  decodeCall: (data?: string) => TDecoded | undefined,
  filterDecodedForTx: (decodedCalls: TDecoded[], txHash: string) => TDecoded[] = (decodedCalls) => decodedCalls,
  matchesDecoded: (decoded: TDecoded, transfer: FundingTransfer) => boolean = () => true,
) {
  const fundingTransfers = await getFundingTransfers(options, config);
  if (!fundingTransfers.length) return [] as { transfer: FundingTransfer; decoded: TDecoded }[];

  const txMap = await getTransactionsByHash(
    options,
    fundingTransfers.map((transfer) => transfer.transactionHash),
    config.cacheKey,
  );

  /**
   * Decode all target calls per tx so batched operations (e.g. multiple
   * createCampaign calls in one Safe multiSend) each match their own transfer.
   */
  const decodedByTx = new Map<string, TDecoded[]>();
  for (const transfer of fundingTransfers) {
    if (decodedByTx.has(transfer.transactionHash)) continue;
    const tx = txMap.get(transfer.transactionHash);
    const decodedCalls = tx ? decodeAllTargetCallsFromTransaction(tx, config.targetLc, decodeCall) : [];
    decodedByTx.set(
      transfer.transactionHash,
      filterDecodedForTx(decodedCalls, transfer.transactionHash),
    );
  }

  /**
   * Match each funding transfer to a decoded call, consuming it via splice
   * so that batched txs (e.g. multiple createCampaign in one multiSend)
   * pair each transfer with a unique decoded call.
   */
  return fundingTransfers.flatMap((transfer) => {
    const remaining = decodedByTx.get(transfer.transactionHash);
    if (!remaining?.length) return [];
    const idx = remaining.findIndex((d) => matchesDecoded(d, transfer));
    if (idx === -1) return [];
    const [decoded] = remaining.splice(idx, 1);
    return [{ transfer, decoded }];
  });
}

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

// USDC top-ups to the veDUST RevenueReward contract, prorated over each 7-day epoch.
async function addVeDustRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const rewardTopUps = await getDecodedFundingTransfers(
    options,
    {
      fundingToken: ADDR.usdc,
      source: ADDR.revenueWallet,
      sink: ADDR.revenueReward,
      lookbackSeconds: WEEK_SECONDS,
      cacheKey: REVENUE_REWARD_CACHE_KEY,
      targetLc: LC.revenueReward,
    },
    decodeRevenueRewardCall,
    undefined,
    (notification, transfer) =>
      lc(notification.token) === LC.usdc
      && notification.amount === transfer.amount,
  );
  if (!rewardTopUps.length) return;

  const timestampByBlock = await getBlockTimestamps(
    options,
    rewardTopUps.map(({ transfer }) => transfer.blockNumber),
  );

  rewardTopUps.forEach(({ transfer }) => {
    const timestamp = timestampByBlock.get(transfer.blockNumber);
    if (!timestamp) return;

    addProratedAmount(
      dailyHoldersRevenue,
      ADDR.usdc,
      transfer.amount,
      timestamp,
      timestamp + WEEK_SECONDS,
      options,
      VEDUST_REWARDS_LABEL,
    );
  });
}

// Merkl DUST-LP incentive campaigns funded by the Revenue wallet, prorated over campaign duration.
async function addDustLpRevenue(options: FetchOptions, dailyHoldersRevenue: Balances) {
  const fundingCampaigns = await getDecodedFundingTransfers(
    options,
    {
      fundingToken: ADDR.nUsdc,
      source: ADDR.revenueWallet,
      sink: ADDR.merklCore,
      lookbackSeconds: MERKL_LOOKBACK_SECONDS,
      cacheKey: MERKL_CACHE_KEY,
      targetLc: LC.merklCreator,
    },
    decodeMerklCampaignCall,
    (decodedCalls, txHash) => {
      const nUsdcCampaigns = decodedCalls.filter((campaign) => lc(campaign.rewardToken) === LC.nUsdc);
      if (nUsdcCampaigns.length > 1)
        console.warn(`neverland: skipping Merkl tx ${txHash} with ${nUsdcCampaigns.length} nUSDC campaigns`);
      return nUsdcCampaigns.length === 1 ? nUsdcCampaigns : [];
    },
  );

  fundingCampaigns.forEach(({ transfer, decoded: campaign }) => {
    const rewardToken = REWARD_TOKEN_PRICE_ALIAS[lc(campaign.rewardToken)] || campaign.rewardToken;
    addProratedAmount(
      dailyHoldersRevenue,
      rewardToken,
      transfer.amount,
      campaign.startTimestamp,
      campaign.startTimestamp + campaign.duration,
      options,
      DUST_LP_INCENTIVES_LABEL,
    );
  });
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
    addDustLpRevenue(options, dailyHoldersRevenue),
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
  HoldersRevenue: "Governance-directed revenue sharing. veDUST revenue contract funding is spread evenly across each 7-day epoch, Merkl DUST liquidity revenue is spread across their active period, and DUST buybacks on the day they reach Neverland's Revenue wallet.",
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
    [VEDUST_REWARDS_LABEL]: "Revenue sharing to veDUST holders in USDC, spread evenly across the 7-day epoch.",
    [DUST_LP_INCENTIVES_LABEL]: "Revenue sharing via Merkl campaigns supporting DUST liquidity, spread evenly across each campaign's active period.",
    [DUST_BUYBACKS_LABEL]: "DUST accrued by the Revenue wallet for burn, recognized on the day of receipt.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false,
  chains: [CHAIN.MONAD],
  fetch,
  start: "2025-11-23",
  methodology,
  breakdownMethodology,
};

export default adapter;
