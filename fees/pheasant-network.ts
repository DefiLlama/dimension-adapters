import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { PHEASANT_SWAP_NEW_TRADE, pheasantSwapChainConfig } from "../helpers/aggregators/pheasant-network";

// Pheasant Network relayer fees. Bridge: NewTrade.amount minus the BridgeOrderOpened.outputAmount of the same user and
// trade index (trades without a matching order are skipped). Swap: SwapNewTrade.trade.relayerFee. Fees taken by the
// routing tools (LI.FI, Squid) are not counted.
const NEW_TRADE = "event NewTrade(address indexed userAddress, uint256 index, address to, uint256 amount, address token)";
const ORDER_OPENED =
  "event BridgeOrderOpened(bytes32 indexed orderId, address indexed user, uint256 indexed tradeIndex, uint8 tokenTypeIndex, uint256 originChainId, uint256 destinationChainId, uint256 destinationNetworkCode, address destinationSettler, bytes originData, uint256 outputAmount)";

// Bridge contracts, as in bridges/pheasant-network.ts.
const bridgeContracts: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x20A41749545eB0C6266838257aDeA7b86d5369Ac",
  [CHAIN.OPTIMISM]: "0x0C4F10259c8b5Ed7238B76A0a6EfEf82cd2908Bf",
  [CHAIN.ARBITRUM]: "0x97450C9B5fC6D1b86bF87EFDCbB137f26F8b497e",
  [CHAIN.SCROLL]: "0xcAebc3309bFe45313922BFBa1a36C4458937E2A2",
  [CHAIN.BASE]: "0x8A7Ee008B18DF025bc778B034Dbd7ad507221e10",
  [CHAIN.LINEA]: "0xbe7F97E4B54747B75B8aaF84ecafE876BaCA9198",
  [CHAIN.TAIKO]: "0x7a651Ef5A53B128d406c9093feA2650e8A6156b5",
  [CHAIN.MORPH]: "0x56DE23ed536b2Bf8D398F2E1703Ce9aDb48B09F4",
  [CHAIN.ERA]: "0xaFDaD3F10c7c906434422F229bCfB120bcE51C6c",
  [CHAIN.UNICHAIN]: "0x81505846153403EBd6Cf5e89dD9f3eF2277fe374",
  [CHAIN.MEGAETH]: "0x554590DC69830507248Ebc7AD3Bc9d6fA94488d2",
};

const swapConfig = pheasantSwapChainConfig();

// Bridge chains run without a cutoff; Swap-only chains keep the Swap start and retirement dates.
const chainConfig: Record<string, { start?: string; deadFrom?: string }> = {};
for (const chain of Object.keys(bridgeContracts)) chainConfig[chain] = {};
for (const [chain, { start, deadFrom }] of Object.entries(swapConfig)) {
  if (!chainConfig[chain]) chainConfig[chain] = { start, deadFrom };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const bridge = bridgeContracts[options.chain];
  if (bridge) {
    const trades = await options.getLogs({ target: bridge, eventAbi: NEW_TRADE });
    const orders = await options.getLogs({ target: bridge, eventAbi: ORDER_OPENED });
    const outputAmounts = new Map(orders.map((o: any) => [`${o.user.toLowerCase()}-${o.tradeIndex}`, BigInt(o.outputAmount)]));
    for (const trade of trades) {
      const outputAmount = outputAmounts.get(`${trade.userAddress.toLowerCase()}-${trade.index}`);
      if (outputAmount === undefined) continue;
      dailyFees.add(trade.token, BigInt(trade.amount) - outputAmount, "Bridge Relayer Fees");
    }
  }

  const swap = swapConfig[options.chain];
  if (swap) {
    const logs = await options.getLogs({ target: swap.swap, eventAbi: PHEASANT_SWAP_NEW_TRADE });
    for (const log of logs) dailyFees.add(log.token, log.trade.relayerFee, "Swap Relayer Fees");
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
    "Bridge Relayer Fees": "Relayer fees on bridge transfers.",
    "Swap Relayer Fees": "Relayer fees on swaps.",
  },
  SupplySideRevenue: {
    "Bridge Relayer Fees": "Relayer fees on bridge transfers.",
    "Swap Relayer Fees": "Relayer fees on swaps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
