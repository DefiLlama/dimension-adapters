import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// DZap router (DZapDiamond), same contract as the swap leg in aggregators/byzanlink-stocks
const DZAP_ROUTER = "0xF708e11A7C94abdE8f6217B13e6fE39C8b9cC0a6";
// Byzanlink's DZap integrator address, also receives the integrator fee: https://basescan.org/tx/0xc3d74485f5e1f20a032dac84f33f555cfe18dca791f8777e5157e8a04d482be7
const BYZANLINK_INTEGRATOR = "0x5bf9e1af9eaFe63344FBB3D227503f9EB80D2B17".toLowerCase();
const NATIVE = "0x0000000000000000000000000000000000000000";

// DZapBridgeStarted carries the integrator; the amount lives in one bridge-specific
// event of the same transactionId. Each bridge tx emits exactly one of these.
const BRIDGE_STARTED =
  "event DZapBridgeStarted(bytes32 indexed transactionId, address indexed user, address indexed integrator)";

interface BridgeEvent {
  eventAbi: string;
  token: (args: any) => string;
  amount: (args: any) => bigint;
}

const BRIDGE_EVENTS: BridgeEvent[] = [
  {
    eventAbi:
      "event BridgeStarted(bytes32 indexed transactionId, address indexed user, bytes receiver, string bridge, address bridgeAddress, address from, bytes to, uint256 amount, uint256 destinationChainId, bytes destinationCalldata)",
    token: (args) => args.from,
    amount: (args) => args.amount,
  },
  {
    eventAbi:
      "event RfqBridgeStarted(bytes32 indexed transactionId, address indexed user, bytes receiver, string bridge, address bridgeAddress, address from, bytes to, uint256 amountIn, uint256 expectedAmountOut, uint256 destinationChainId, bytes destinationCalldata, bytes solverData)",
    token: (args) => args.from,
    amount: (args) => args.amountIn,
  },
  {
    eventAbi:
      "event CctpBridgeTransferStarted(bytes32 indexed transactionId, address indexed user, bytes32 receiver, address from, bytes to, uint256 amountIn, uint32 destinationDomain, bytes destinationCalldata)",
    token: (args) => args.from,
    amount: (args) => args.amountIn,
  },
  {
    eventAbi:
      "event RelayBridgeTransferStarted(bytes32 indexed transactionId, address indexed user, bytes reciever, address from, bytes to, (uint256 amountIn, bytes32 requestId) relayData, uint256 destinationChainId, bytes destinationCalldata)",
    token: (args) => args.from,
    amount: (args) => args.relayData.amountIn,
  },
  {
    eventAbi:
      "event OFTBridgeTransferStarted(bytes32 indexed transactionId, address indexed user, address indexed oftAddress, address refundAddress, uint32 dstEid, bytes32 recipient, uint256 amount, bytes destinationCalldata)",
    token: (args) => args.oftAddress,
    amount: (args) => args.amount,
  },
  {
    eventAbi:
      "event GasZipBridgeTransferStarted(bytes32 indexed transactionId, address indexed user, (bytes32 recipient, uint256 destChains, uint256 depositAmount) gasZipData, bytes destinationCalldata)",
    token: () => NATIVE,
    amount: (args) => args.gasZipData.depositAmount,
  },
];

export const addBridgeVolume = async (
  options: FetchOptions,
  dailyBridgeVolume: any,
  integrator = BYZANLINK_INTEGRATOR,
) => {
  // transactionId is caller-supplied, so match on the tx hash too
  const key = (log: any) => `${log.transactionHash.toLowerCase()}:${log.args.transactionId.toLowerCase()}`;
  const started = await options.getLogs({ target: DZAP_ROUTER, eventAbi: BRIDGE_STARTED, onlyArgs: false });
  const byzanlinkBridges = new Set<string>(
    started
      .filter((log: any) => log.args.integrator.toLowerCase() === integrator.toLowerCase())
      .map(key),
  );
  if (byzanlinkBridges.size === 0) return;

  for (const bridge of BRIDGE_EVENTS) {
    const logs = await options.getLogs({ target: DZAP_ROUTER, eventAbi: bridge.eventAbi, onlyArgs: false });
    for (const log of logs) {
      if (!byzanlinkBridges.has(key(log))) continue;
      dailyBridgeVolume.addToken(bridge.token(log.args), bridge.amount(log.args), { label: "DZap" });
    }
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  await addBridgeVolume(options, dailyBridgeVolume);
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-10-22",
  doublecounted: true, // executed by the underlying bridges
  methodology: {
    BridgeVolume:
      "Value of tokens Byzanlink users bridge out through the DZap router, measured on the source chain at the amount sent.",
  },
  breakdownMethodology: {
    BridgeVolume: {
      DZap: "Bridges started through the DZap router with the Byzanlink integrator address, matched to the bridge-specific transfer event by transaction id.",
    },
  },
};

export default adapter;
