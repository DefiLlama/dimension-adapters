import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchTransfersFromLIFIAPI, LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// DZap router (DZapDiamond), same contract as the swap leg in aggregators/byzanlink-stocks
const DZAP_ROUTER = "0xF708e11A7C94abdE8f6217B13e6fE39C8b9cC0a6";
// Byzanlink's DZap integrator address, also receives the integrator fee: https://basescan.org/tx/0xc3d74485f5e1f20a032dac84f33f555cfe18dca791f8777e5157e8a04d482be7
const BYZANLINK_INTEGRATOR = "0x5bf9e1af9eaFe63344FBB3D227503f9EB80D2B17".toLowerCase();
const NATIVE = ADDRESSES.null;

// Byzanlink's cross-chain swaps (markets.byzanlink.com/swap) go through LI.FI under these integrator strings, the
// same LiFiTransferStarted event as bridge-aggregators/lifi and bridge-aggregators/hyperdex:
// - n648b9dyeycthu2c9ob2: the live app's integrator id, since 2026-11-19.
//   Sample (Ethereum -> Base): https://etherscan.io/tx/0xf8bd988803a0043ccf31d5a7b3f820ee6b5d3cc6230fbdfce8eeabf5dc733d6a#eventlog
// - byzanlink-rwa-markets: the default string in Byzanlink's backend, used on 2026-11-18.
//   Sample (Base -> Ethereum): https://basescan.org/tx/0xcfe15b311cc2bded2be18bea51ec0bef5e85237de2f9723385f2c83d81d4e6cd#eventlog
const LIFI_INTEGRATORS = ["n648b9dyeycthu2c9ob2", "byzanlink-rwa-markets"];
const LIFI_TRANSFER_STARTED =
  "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";

// Each chain Byzanlink users bridge out from, starting on the first LI.FI transfer from it under the integrators
// above. LI.FI's Solana program emits no EVM logs, so Solana is read from LI.FI's analytics API filtered by the
// same integrators.
// Diamond addresses: helpers/aggregators/lifi.ts (LifiDiamonds), https://github.com/lifinance/contracts/tree/main/deployments
const chainConfig: Record<string, { start: string; dzap?: boolean; lifi?: "logs" | "api" }> = {
  [CHAIN.BASE]: { start: "2026-10-22", dzap: true, lifi: "logs" },
  [CHAIN.SOLANA]: { start: "2026-11-18", lifi: "api" },
  [CHAIN.ETHEREUM]: { start: "2026-11-23", lifi: "logs" },
};

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
      dailyBridgeVolume.addToken(bridge.token(log.args), bridge.amount(log.args), "DZap");
    }
  }
};

const addLifiVolume = async (options: FetchOptions, dailyBridgeVolume: any) => {
  const { lifi } = chainConfig[options.chain];
  if (lifi === "api") {
    const transfers = await fetchTransfersFromLIFIAPI(options.startTimestamp, options.endTimestamp, LIFI_INTEGRATORS, options.chain);
    for (const tx of transfers) {
      if (tx.receiving.chainId === tx.sending.chainId) continue; // same-chain swaps are not bridge volume
      dailyBridgeVolume.addUSDValue(Number(tx.sending.amountUSD), "LI.FI");
    }
    return;
  }
  const logs = await options.getLogs({ target: LifiDiamonds[options.chain].id, eventAbi: LIFI_TRANSFER_STARTED });
  for (const { bridgeData } of logs) {
    if (!LIFI_INTEGRATORS.includes(bridgeData.integrator.toLowerCase())) continue;
    dailyBridgeVolume.addToken(bridgeData.sendingAssetId, bridgeData.minAmount, "LI.FI");
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const { dzap, lifi } = chainConfig[options.chain];
  if (dzap) await addBridgeVolume(options, dailyBridgeVolume);
  if (lifi) await addLifiVolume(options, dailyBridgeVolume);
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true, // executed by the underlying bridges
  methodology: {
    BridgeVolume:
      "Value of tokens Byzanlink users bridge out through the DZap router or LI.FI, measured on the source chain at the amount sent.",
  },
  breakdownMethodology: {
    BridgeVolume: {
      DZap: "Bridges through the DZap router with Byzanlink's integrator address, at the amount sent from Base.",
      "LI.FI": "Bridges through LI.FI under Byzanlink's integrator strings, at the amount sent: LiFiTransferStarted logs on Base and Ethereum, LI.FI's analytics API on Solana.",
    },
  },
};

export default adapter;
