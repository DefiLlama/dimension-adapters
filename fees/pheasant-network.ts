import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { PHEASANT_SWAP_NEW_TRADE, pheasantSwapChainConfig } from "../helpers/aggregators/pheasant-network";

// Pheasant Network relayer fees.
// Bridge: NewTrade.amount minus the BridgeOrderOpened.outputAmount of the same user and trade index (trades without a
// matching order are skipped).
// Swap: SwapNewTrade.trade.relayerFee, minus the part refunded to the user when a swap fails (SwapRefundTrade.refunded)
// and the fee of cancelled trades (SwapCancelUnbackedTrade.fee). Fees taken by the routing tools (LI.FI, Squid) are not
// counted.
const NEW_TRADE = "event NewTrade(address indexed userAddress, uint256 index, address to, uint256 amount, address token)";
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

type ChainConfig = { bridge?: string; swap?: string; start: string; deadFrom?: string };

// Bridge contracts (as in bridges/pheasant-network.ts) from their first day; the Swap contracts are merged in below.
const BRIDGE_START = "2026-06-08";
const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { bridge: "0x20A41749545eB0C6266838257aDeA7b86d5369Ac", start: BRIDGE_START },
  [CHAIN.OPTIMISM]: { bridge: "0x0C4F10259c8b5Ed7238B76A0a6EfEf82cd2908Bf", start: BRIDGE_START },
  [CHAIN.ARBITRUM]: { bridge: "0x97450C9B5fC6D1b86bF87EFDCbB137f26F8b497e", start: BRIDGE_START },
  [CHAIN.SCROLL]: { bridge: "0xcAebc3309bFe45313922BFBa1a36C4458937E2A2", start: BRIDGE_START },
  [CHAIN.BASE]: { bridge: "0x8A7Ee008B18DF025bc778B034Dbd7ad507221e10", start: BRIDGE_START },
  [CHAIN.LINEA]: { bridge: "0xbe7F97E4B54747B75B8aaF84ecafE876BaCA9198", start: BRIDGE_START },
  [CHAIN.TAIKO]: { bridge: "0x7a651Ef5A53B128d406c9093feA2650e8A6156b5", start: BRIDGE_START },
  [CHAIN.MORPH]: { bridge: "0x56DE23ed536b2Bf8D398F2E1703Ce9aDb48B09F4", start: BRIDGE_START },
  [CHAIN.ERA]: { bridge: "0xaFDaD3F10c7c906434422F229bCfB120bcE51C6c", start: BRIDGE_START },
  [CHAIN.UNICHAIN]: { bridge: "0x81505846153403EBd6Cf5e89dD9f3eF2277fe374", start: BRIDGE_START },
  [CHAIN.MEGAETH]: { bridge: "0x554590DC69830507248Ebc7AD3Bc9d6fA94488d2", start: BRIDGE_START },
};

// Chains with a bridge keep running after their Swap retirement; Swap-only chains keep the Swap start and deadFrom.
for (const [chain, { swap, start, deadFrom }] of Object.entries(pheasantSwapChainConfig())) {
  const config = chainConfig[chain];
  if (config) {
    config.swap = swap;
    if (start < config.start) config.start = start;
  } else {
    chainConfig[chain] = { swap, start, deadFrom };
  }
}

const fetch = async (options: FetchOptions) => {
  const { bridge, swap } = chainConfig[options.chain];
  const dailyFees = options.createBalances();

  if (bridge) {
    const trades = await options.getLogs({ target: bridge, eventAbi: NEW_TRADE });
    const orders = await options.getLogs({ target: bridge, eventAbi: ORDER_OPENED });
    const outputAmounts = new Map(orders.map((o: any) => [`${o.user.toLowerCase()}-${o.tradeIndex}`, BigInt(o.outputAmount)]));
    for (const trade of trades) {
      const outputAmount = outputAmounts.get(`${trade.userAddress.toLowerCase()}-${trade.index}`);
      if (outputAmount === undefined) continue;
      dailyFees.add(trade.token, BigInt(trade.amount) - outputAmount, BRIDGE_FEES);
    }
  }

  if (swap) {
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
