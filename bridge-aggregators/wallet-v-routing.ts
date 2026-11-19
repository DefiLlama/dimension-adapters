import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addToken, FEE_WALLET, RANGO } from '../helpers/aggregators/wallet-v';

// Wallet V's Rango dApp tag: https://optimism.blockscout.com/tx/0xc5f4c4cac29234e3603a962344b634a2c273cedb6d28b7fa6cc86ad578c827d1
const DAPP_TAG = 1579n;
const BRIDGE_EVENT = 'event RangoBridgeInitiated(address indexed requestId, address bridgeToken, uint256 bridgeAmount, address receiver, uint256 destinationChainId, bool hasInterchainMessage, bool hasDestinationSwap, uint8 indexed bridgeId, uint16 indexed dAppTag, string dAppName)';
// Routes via a generic call (e.g. Mayan Swift) log a swap with zero output: https://eth.blockscout.com/tx/0xc04a1836326ee62b5c6e84cbf88bf50c11b8f59a660a24648abf02957af853ac
const SWAP_EVENT = 'event RangoSwap(address indexed requestId, address fromToken, address toToken, uint256 amountIn, uint256 minimumAmountOut, uint16 indexed dAppTag, uint256 outputAmount, address receiver, string dAppName)';
const FEE_EVENTS = [
  'event FeeInfo(address token, address indexed affiliatorAddress, uint256 platformFee, uint256 destinationExecutorFee, uint256 affiliateFee, uint16 indexed dAppTag)',
  'event FeeInfo(address token, address indexed affiliatorAddress, uint256 affiliateFee, uint8 indexed feeType, uint16 indexed dAppTag)',
];

const txHash = (log: any): string => log.transactionHash ?? log.transaction_hash;
const walletV = (log: any) => BigInt(log.args.dAppTag) === DAPP_TAG;

async function fetch(options: FetchOptions) {
  const dailyBridgeVolume = options.createBalances();
  const feeTxs = new Set<string>();
  for (const eventAbi of FEE_EVENTS) {
    for (const log of await options.getLogs({ target: RANGO, eventAbi, onlyArgs: false })) {
      if (walletV(log) && log.args.affiliatorAddress.toLowerCase() === FEE_WALLET) feeTxs.add(txHash(log));
    }
  }

  const bridged = new Set<string>();
  for (const log of await options.getLogs({ target: RANGO, eventAbi: BRIDGE_EVENT, onlyArgs: false })) {
    if (!walletV(log) || !feeTxs.has(txHash(log)) || bridged.has(txHash(log))) continue;
    bridged.add(txHash(log));
    addToken(dailyBridgeVolume, log.args.bridgeToken, log.args.bridgeAmount);
  }
  for (const log of await options.getLogs({ target: RANGO, eventAbi: SWAP_EVENT, onlyArgs: false })) {
    if (!walletV(log) || !feeTxs.has(txHash(log)) || bridged.has(txHash(log)) || BigInt(log.args.outputAmount) !== 0n) continue;
    bridged.add(txHash(log));
    addToken(dailyBridgeVolume, log.args.fromToken, log.args.amountIn);
  }
  return { dailyBridgeVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2025-07-18' },
    [CHAIN.BSC]: { start: '2025-07-17' },
    [CHAIN.BASE]: { start: '2025-07-18' },
    [CHAIN.ARBITRUM]: { start: '2025-07-18' },
    [CHAIN.OPTIMISM]: { start: '2025-07-17' },
    [CHAIN.POLYGON]: { start: '2025-07-22' },
    [CHAIN.AVAX]: { start: '2025-07-17' },
  },
  doublecounted: true,
  methodology: {
    BridgeVolume: 'Principal sent cross-chain through Rango from Wallet V, counted on the source chain when the bridge starts. Only routes that paid Wallet V its affiliate fee count.',
  },
};

export default adapter;
