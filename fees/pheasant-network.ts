import { Interface } from "ethers";
import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import {
  CANCELLED,
  CURRENT_START,
  GET_TRADE,
  Kind,
  LEGACY_NEW_TRADE,
  MORPH_WETH,
  NEW_TRADE,
  PERIOD,
  pheasantBridgeChainConfig,
  toTimestamp,
} from "../bridges/pheasant-network";
import { PHEASANT_SWAP_NEW_TRADE, pheasantSwapChainConfig } from "../helpers/aggregators/pheasant-network";

// Pheasant Network relayer fees.
// Bridge: NewTrade.amount minus the BridgeOrderOpened.outputAmount of the same user and trade index (trades without a
// matching order are skipped). For the earlier deployments, the fee of each trade as returned by getTrade.
// Swap: SwapNewTrade.trade.relayerFee, minus the part refunded to the user when a swap fails (SwapRefundTrade.refunded)
// and the fee of cancelled trades (SwapCancelUnbackedTrade.fee). Fees taken by the routing tools (LI.FI, Squid) are not
// counted.
const ORDER_OPENED =
  "event BridgeOrderOpened(bytes32 indexed orderId, address indexed user, uint256 indexed tradeIndex, uint8 tokenTypeIndex, uint256 originChainId, uint256 destinationChainId, uint256 destinationNetworkCode, address destinationSettler, bytes originData, uint256 outputAmount)";
const SWAP_REFUND =
  "event SwapRefundTrade(address indexed userAddress, address indexed token, bytes32 tradeHash, uint256 refunded, uint256 fee, bytes data)";
const SWAP_CANCEL =
  "event SwapCancelUnbackedTrade(address indexed userAddress, address indexed token, bytes32 tradeHash, uint256 fee)";
// The three Swap events are fetched in one getLogs call and decoded here.
const swapInterface = new Interface([PHEASANT_SWAP_NEW_TRADE, SWAP_REFUND, SWAP_CANCEL]);
const swapTopics = [swapInterface.fragments.map((fragment: any) => fragment.topicHash)];

const BRIDGE_FEES = "Bridge Relayer Fees";
const SWAP_FEES = "Swap Relayer Fees";

type ChainConfig = {
  bridge?: string;
  legacy?: Partial<Record<Kind, string>>;
  swap?: string;
  swapStart?: string;
  start: string;
  deadFrom?: string;
};

// Bridge contracts and their start as in bridges/pheasant-network.ts; the Swap contracts are merged in below.
const chainConfig: Record<string, ChainConfig> = {};
for (const [chain, { bridge, legacy, start, deadFrom }] of Object.entries(pheasantBridgeChainConfig)) {
  chainConfig[chain] = { bridge, legacy, start, deadFrom };
}

// A chain runs from its earlier start and stops only when both its bridge and its Swap contract are retired.
for (const [chain, { swap, start, deadFrom }] of Object.entries(pheasantSwapChainConfig())) {
  const config = chainConfig[chain];
  if (config) {
    config.swap = swap;
    config.swapStart = start;
    if (start < config.start) config.start = start;
    if (!deadFrom || !config.deadFrom) delete config.deadFrom;
    else if (deadFrom > config.deadFrom) config.deadFrom = deadFrom;
  } else {
    chainConfig[chain] = { swap, swapStart: start, start, deadFrom };
  }
}

const fetch = async (options: FetchOptions) => {
  const { bridge, legacy = {}, swap, swapStart } = chainConfig[options.chain];
  const dailyFees = options.createBalances();

  for (const [kind, target] of Object.entries(legacy) as [Kind, string][]) {
    const [from, to] = PERIOD[kind].map(toTimestamp);
    if (options.toTimestamp <= from || options.fromTimestamp >= to) continue;
    const priced = kind === "c" || kind === "d"; // these kinds emit the token; the older ones only bridged ETH
    const logs = await options.getLogs({ target, eventAbi: priced ? NEW_TRADE : LEGACY_NEW_TRADE });
    // trades never change their fee, so they are read at the latest block
    const trades = await new ChainApi({ chain: options.chain }).multiCall({
      abi: GET_TRADE[kind === "a" ? "a" : "b"],
      calls: logs.map((l: any) => ({ target, params: [l.userAddress, l.index] })),
    });
    trades.forEach((trade: any, i: number) => {
      if (trade.isUpward || Number(trade.status) === CANCELLED) return;
      if (!priced) dailyFees.addCGToken("ethereum", Number(trade.fee) / 1e18, BRIDGE_FEES);
      else dailyFees.add(logs[i].token.toLowerCase() === MORPH_WETH ? ADDRESSES.null : logs[i].token, trade.fee, BRIDGE_FEES);
    });
  }

  if (bridge && options.toTimestamp > toTimestamp(CURRENT_START)) {
    const trades = await options.getLogs({ target: bridge, eventAbi: NEW_TRADE });
    const orders = await options.getLogs({ target: bridge, eventAbi: ORDER_OPENED });
    const outputAmounts = new Map(orders.map((o: any) => [`${o.user.toLowerCase()}-${o.tradeIndex}`, BigInt(o.outputAmount)]));
    for (const trade of trades) {
      const outputAmount = outputAmounts.get(`${trade.userAddress.toLowerCase()}-${trade.index}`);
      if (outputAmount === undefined) continue;
      dailyFees.add(trade.token, BigInt(trade.amount) - outputAmount, BRIDGE_FEES);
    }
  }

  if (swap && options.toTimestamp > toTimestamp(swapStart!)) {
    const logs = await options.getLogs({ target: swap, topics: swapTopics as any, entireLog: true });
    for (const log of logs) {
      const { name, args } = swapInterface.parseLog(log)!;
      if (name === "SwapNewTrade") dailyFees.add(args.token, args.trade.relayerFee, SWAP_FEES);
      else if (name === "SwapRefundTrade") dailyFees.subtractToken(args.token, args.refunded, SWAP_FEES);
      else dailyFees.subtractToken(args.token, args.fee, SWAP_FEES);
    }
  }

  return { dailyFees, dailyRevenue: 0, dailyProtocolRevenue: 0, dailyHoldersRevenue: 0, dailySupplySideRevenue: dailyFees };
};

const methodology = {
  Fees: "Total fees paid by users for bridge and swap txs.",
  Revenue: "Protocol revenue is currently 0.",
  ProtocolRevenue: "Pheasant Network currently takes no protocol fee.",
  HoldersRevenue: "Revenue distributed to token holders is currently 0.",
  SupplySideRevenue: "All fees paid by users go to the relayers.",
};

const breakdownMethodology = {
  Fees: {
    [BRIDGE_FEES]: "Relayer fees on bridge transfers.",
    [SWAP_FEES]: "Relayer fees on swaps, net of fees refunded for failed swaps.",
  },
  SupplySideRevenue: {
    [BRIDGE_FEES]: "Relayer fees on bridge transfers.",
    [SWAP_FEES]: "Relayer fees on swaps, net of fees refunded for failed swaps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // refunds of earlier swaps can exceed the fees of the day
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
