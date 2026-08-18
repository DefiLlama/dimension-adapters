import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { ethers } from "ethers";
import { quoteAtTick } from "./tickMath";

// DeepstateV1 production router and deployment start block on Robinhood Chain.
// Source for both values: https://deepstate.sh/api/runtime
const ROUTER = "0x6cf19308C22FC82ea620Fa0B3E94948d20f27B96";
const START_BLOCK = 36_932_568;
const USDG = ADDRESSES.robinhood.USDG;
// Governance-configured protocol recipient (`feeFlowController`): https://deepstate.sh/api/runtime
const PROTOCOL_FEE_RECIPIENT = "0xbfb7b3Ff3D498a559b946B836d26F0E168f273D5";
// Official interface recipient (`integratorFee.recipient`): https://deepstate.sh/api/runtime
const FRONTEND_FEE_RECIPIENT = "0xFCD5B1592fF743DB9864A577cdFFF3a2fF31E7cb";
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";

type PoolConfig = {
  label: string;
  volumeToken: string;
  volumeSide: "token0" | "token1";
  initialBook: string;
};

// BookInitialized identifies a pool by hash but does not include its token addresses.
// Register each permissionlessly created pool here; subsequent book epochs are discovered below.
// Source for every pool id and initial book id: https://deepstate.sh/api/runtime
// Amount semantics use sorted token0/token1, not the UI's displayed base/quote labels:
// https://github.com/Deepstate-Protocol/deepstate-contracts/blob/bf18c54b13123de5ecc3e05dcff6822436e0cd27/src/DeepstateV1.sol#L2110-L2112
const POOLS: Record<string, PoolConfig> = {
  "0x42819cadfbb25aab80543236e280fba4e61aa61e0b5b777541de54ae69da35e4": {
    label: "NVDA/USDG",
    volumeToken: USDG,
    volumeSide: "token0", // USDG is the lower address.
    initialBook: "0xdf941c235503a5d2e67aee5dea00f2965f99421c0d034bd77f924c05c66bf399",
  },
  "0xbd11e0ec02d8fb9b08dfd465e892cb71e2cb9b2d4697a58baf13bdc1e8753786": {
    label: "DEEP/USDG",
    volumeToken: USDG,
    volumeSide: "token1", // USDG is the higher address.
    initialBook: "0xcde1e9c260cbf55986bf267eafbf57c03aa9bff03e45e96b900f35d3d083d1b6",
  },
};

const BOOK_INITIALIZED = "event BookInitialized(bytes32 poolId, bytes32 bookId, uint256 epoch)";
const ASK_MATCHED = "event AskMatched(bytes32 bookId, bytes32 restingNode)";
const ASKS_MATCHED = "event AsksMatched(bytes32 bookId, bytes32[] restingNodes)";
const BID_MATCHED = "event BidMatched(bytes32 bookId, bytes32 restingNode)";
const BIDS_MATCHED = "event BidsMatched(bytes32 bookId, bytes32[] restingNodes)";
const ASK_SUBTREE_MATCHED =
  "event AskSubtreeMatched(bytes32 bookId, bytes32 subtreeRoot, uint160 quantity, uint256 quoteAmount)";
const BID_SUBTREE_MATCHED =
  "event BidSubtreeMatched(bytes32 bookId, bytes32 subtreeRoot, uint160 quantity, uint256 quoteAmount)";

const UINT32_MASK = (1n << 32n) - 1n;
const UINT160_MASK = (1n << 160n) - 1n;

function matchedNodeAmounts(node: string, restingIsBid: boolean) {
  const packed = BigInt(node);
  const unsignedTick = Number((packed >> 224n) & UINT32_MASK);
  const tick = unsignedTick >= 0x80000000 ? unsignedTick - 0x100000000 : unsignedTick;
  const quantity = (packed >> 64n) & UINT160_MASK;
  const correction = ((packed >> 32n) & UINT32_MASK) - 1n;
  const baselineQuote = quoteAtTick(tick, quantity, restingIsBid);
  const quoteAmount = restingIsBid ? baselineQuote + correction : baselineQuote - correction;
  return { quantity, quoteAmount };
}

async function addRouterTransfers(
  options: FetchOptions,
  recipient: string,
  balances: ReturnType<FetchOptions["createBalances"]>,
) {
  const logs = await options.getLogs({
    noTarget: true,
    eventAbi: TRANSFER,
    topics: [
      TRANSFER_TOPIC,
      ethers.zeroPadValue(ROUTER, 32),
      ethers.zeroPadValue(recipient, 32),
    ],
    entireLog: true,
  });

  logs.forEach((log) => {
    if (log.data !== "0x") balances.add(log.address, BigInt(log.data));
  });
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const protocolFees = options.createBalances();
  const frontendFees = options.createBalances();
  const books = new Map<string, PoolConfig>();
  Object.values(POOLS).forEach((pool) => books.set(pool.initialBook, pool));

  // A pool rolls to a new book id when an epoch is exhausted.
  const initialized = await options.getLogs({
    target: ROUTER,
    eventAbi: BOOK_INITIALIZED,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
  });
  initialized.forEach((log) => {
    const pool = POOLS[log.poolId.toLowerCase()];
    if (pool) books.set(log.bookId.toLowerCase(), pool);
  });

  const addTrade = (bookId: string, token0Amount: bigint, token1Amount: bigint) => {
    const pool = books.get(bookId.toLowerCase());
    if (!pool) return;
    const amount = pool.volumeSide === "token0" ? token0Amount : token1Amount;
    dailyVolume.add(pool.volumeToken, amount);
  };
  const addNode = (bookId: string, node: string, restingIsBid: boolean) => {
    const { quantity, quoteAmount } = matchedNodeAmounts(node, restingIsBid);
    addTrade(bookId, quantity, quoteAmount);
  };

  const askMatches = await options.getLogs({ target: ROUTER, eventAbi: ASK_MATCHED });
  askMatches.forEach((log) => addNode(log.bookId, log.restingNode, false));

  const askBatches = await options.getLogs({ target: ROUTER, eventAbi: ASKS_MATCHED });
  askBatches.forEach((log) => log.restingNodes.forEach((node: string) => addNode(log.bookId, node, false)));

  const bidMatches = await options.getLogs({ target: ROUTER, eventAbi: BID_MATCHED });
  bidMatches.forEach((log) => addNode(log.bookId, log.restingNode, true));

  const bidBatches = await options.getLogs({ target: ROUTER, eventAbi: BIDS_MATCHED });
  bidBatches.forEach((log) => log.restingNodes.forEach((node: string) => addNode(log.bookId, node, true)));

  const askSubtrees = await options.getLogs({ target: ROUTER, eventAbi: ASK_SUBTREE_MATCHED });
  askSubtrees.forEach((log) => addTrade(log.bookId, log.quantity, log.quoteAmount));

  const bidSubtrees = await options.getLogs({ target: ROUTER, eventAbi: BID_SUBTREE_MATCHED });
  bidSubtrees.forEach((log) => addTrade(log.bookId, log.quantity, log.quoteAmount));

  await Promise.all([
    addRouterTransfers(options, PROTOCOL_FEE_RECIPIENT, protocolFees),
    addRouterTransfers(options, FRONTEND_FEE_RECIPIENT, frontendFees),
  ]);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(protocolFees, "Protocol fees");
  dailyFees.addBalances(frontendFees, "Interface fees");

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(protocolFees, "Fees to STATE vault");
  dailyRevenue.addBalances(frontendFees, "Official interface fees");

  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addBalances(protocolFees, "Fees to STATE vault");

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(frontendFees, "Official interface fees");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "USDG notional matched across every registered Deepstate pool. Direct fills, batched matches, subtree matches, third-party fills, and every routed leg touching a pool are included from router events.",
  Fees:
    "All taker fees transferred by the router: the governance-configured protocol fee plus call-scoped integrator fees charged by the official interface.",
  UserFees: "Same as Fees. Both fees are deducted independently from matched taker output.",
  Revenue: "Protocol fees sent to the STATE vault plus official-interface integrator fees.",
  HoldersRevenue: "Protocol fees sent to the STATE vault for pro-rata redemption by STATE holders.",
  ProtocolRevenue: "Integrator fees sent to the official Deepstate interface recipient.",
  SupplySideRevenue: "Zero. Resting-order makers receive execution proceeds and token incentives, not taker fees.",
};

const breakdownMethodology = {
  Fees: {
    "Protocol fees": "Governance-configured taker fee transferred by the router to the STATE vault.",
    "Interface fees": "Call-scoped integrator fee charged by the official Deepstate interface.",
  },
  UserFees: {
    "Protocol fees": "Governance-configured taker fee deducted from matched taker output.",
    "Interface fees": "Official-interface integrator fee deducted independently from matched taker output.",
  },
  Revenue: {
    "Fees to STATE vault": "Protocol fees sent to the STATE vault.",
    "Official interface fees": "Integrator fees sent to the official Deepstate interface recipient.",
  },
  HoldersRevenue: {
    "Fees to STATE vault": "Protocol fees sent to the STATE vault for pro-rata redemption by STATE holders.",
  },
  ProtocolRevenue: {
    "Official interface fees": "Integrator fees sent to the official Deepstate interface recipient.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  // Hourly adapters are validated against the previous day by the shared runner.
  // START_BLOCK remains the hard deployment boundary for event reads.
  start: "2026-08-14",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;
