import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../chains";

// Pheasant Swap (PheasantNetworkSwap.execute): the user hands `amount` of `token` to the Swap contract, which keeps
// `relayerFee` (PheasantNetworkSwapParameters.getRelayerFee) and forwards `amount - relayerFee` to a third-party routing
// tool (swapToolIndex 0 = LI.FI diamond, 1 = Squid router) for a same-chain swap or a cross-chain swap. Every request emits
// SwapNewTrade on the source chain; trade.toChainId is the destination chain id as a decimal string, so a trade whose
// toChainId equals the chain's own id is a same-chain swap (aggregators/pheasant-network) and every other one is a
// cross-chain swap (bridge-aggregators/pheasant-network). Volume is the amount forwarded to the tool.
// Contracts: PheasantNetworkSwapProxy per chain (0xfC9C…5696 everywhere except Optimism, Celo, Fraxtal and Metis, where the
// proxy and proxy-admin addresses are swapped); `start` is the proxy's creation block. Public list:
// https://docs.pheasant.network/products/swap/supported-networks
// Chains retired on 2026-10-08 (no new swaps accepted, contracts still settle) keep their history with `deadFrom`.
// Sei (chain id 1329, same proxy, created 2025-02-25) is not listed: getLogs is disabled for sei in adapters/utils/runAdapter.ts.
export const PHEASANT_SWAP_NEW_TRADE =
  "event SwapNewTrade(address indexed userAddress, address indexed token, (string toChainId, uint16 swapToolIndex, address toolContract, address toToken, uint256 amount, uint256 relayerFee, uint256 timestamp) trade)";

const SWAP = "0xfC9C6B6e0D02EaDE37aC8b6c59e7181726075696";
const SWAP_ALT = "0x7956c6EaEA7cAb8cd6C3221aBE3425c7e07133d9";
const RETIRED = "2026-10-08";

const pheasantSwapConfig: Record<string, { chainId: number; swap: string; start: string; deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, swap: SWAP, start: "2025-02-25" },
  [CHAIN.OPTIMISM]: { chainId: 10, swap: SWAP_ALT, start: "2025-02-25" },
  [CHAIN.ARBITRUM]: { chainId: 42161, swap: SWAP, start: "2025-02-25" },
  [CHAIN.BASE]: { chainId: 8453, swap: SWAP, start: "2025-02-25" },
  [CHAIN.AVAX]: { chainId: 43114, swap: SWAP, start: "2025-02-25" },
  [CHAIN.BSC]: { chainId: 56, swap: SWAP, start: "2025-02-25" },
  [CHAIN.XDAI]: { chainId: 100, swap: SWAP, start: "2025-02-25" },
  [CHAIN.SCROLL]: { chainId: 534352, swap: SWAP, start: "2025-02-25" },
  [CHAIN.LINEA]: { chainId: 59144, swap: SWAP, start: "2025-02-26" },
  [CHAIN.POLYGON]: { chainId: 137, swap: SWAP, start: "2025-02-26" },
  [CHAIN.CRONOS]: { chainId: 25, swap: SWAP, start: "2025-02-26" },
  [CHAIN.MANTLE]: { chainId: 5000, swap: SWAP, start: "2025-02-26" },
  [CHAIN.MODE]: { chainId: 34443, swap: SWAP, start: "2025-02-26" },
  [CHAIN.WC]: { chainId: 480, swap: SWAP, start: "2025-02-26" },
  [CHAIN.LISK]: { chainId: 1135, swap: SWAP, start: "2025-02-26" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, swap: SWAP, start: "2026-10-09" },
  [CHAIN.MONAD]: { chainId: 143, swap: SWAP, start: "2026-10-09" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, swap: SWAP, start: "2026-10-10" }, // HyperEVM
  [CHAIN.INK]: { chainId: 57073, swap: SWAP, start: "2026-10-10" },
  [CHAIN.PLASMA]: { chainId: 9745, swap: SWAP, start: "2026-10-10" },
  // retired 2026-10-08
  [CHAIN.AURORA]: { chainId: 1313161554, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.FANTOM]: { chainId: 250, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.IMX]: { chainId: 13371, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.KAVA]: { chainId: 2222, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.MOONBEAM]: { chainId: 1284, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.MOONRIVER]: { chainId: 1285, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.POLYGON_ZKEVM]: { chainId: 1101, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.TAIKO]: { chainId: 167000, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.FILECOIN]: { chainId: 314, swap: SWAP, start: "2025-02-25", deadFrom: RETIRED },
  [CHAIN.BLAST]: { chainId: 81457, swap: SWAP, start: "2025-02-26", deadFrom: RETIRED },
  [CHAIN.BOBA]: { chainId: 288, swap: SWAP, start: "2025-02-26", deadFrom: RETIRED },
  [CHAIN.CELO]: { chainId: 42220, swap: SWAP_ALT, start: "2025-02-26", deadFrom: RETIRED },
  [CHAIN.FRAXTAL]: { chainId: 252, swap: SWAP_ALT, start: "2025-02-26", deadFrom: RETIRED },
  [CHAIN.METIS]: { chainId: 1088, swap: SWAP_ALT, start: "2025-02-26", deadFrom: RETIRED },
};

/**
 * The Swap chain config for one adapter module, to pass as `adapter: chainConfig`.
 *
 * Each module gets its own copy of every chain entry: the runtime writes the module's `fetch` onto the entries it is
 * given and does not overwrite one that is already set, so the two Swap modules must not share entries.
 */
export const pheasantSwapChainConfig = () => Object.fromEntries(Object.entries(pheasantSwapConfig).map(([chain, config]) => [chain, { ...config }]));

/**
 * Sums the value users handed to Pheasant Swap on `options.chain` during the fetch window.
 *
 * Every SwapNewTrade log is classified by `trade.toChainId`: equal to the chain's own id means a same-chain swap, any
 * other value a cross-chain swap. Only trades matching `mode` are counted, at `trade.amount - trade.relayerFee` of
 * `token`, the amount the Swap contract forwards to the routing tool. Trades with a zero relayer fee are skipped.
 *
 * @param options fetch options for the chain and window; `options.chain` must be a key of `pheasantSwapConfig`
 * @param mode which trades to count: "same-chain" (aggregators listing) or "cross-chain" (bridge-aggregators listing)
 * @returns a Balances object holding the matching volume by token
 */
export async function fetchPheasantSwapVolume(options: FetchOptions, mode: "same-chain" | "cross-chain") {
  const { chainId, swap } = pheasantSwapConfig[options.chain];
  const volume = options.createBalances();
  const logs = await options.getLogs({ target: swap, eventAbi: PHEASANT_SWAP_NEW_TRADE });
  for (const log of logs) {
    const { toChainId, amount, relayerFee } = log.trade;
    const sameChain = Number(toChainId) === chainId;
    if (sameChain !== (mode === "same-chain")) continue;
    if (BigInt(relayerFee) === 0n) continue;
    volume.add(log.token, BigInt(amount) - BigInt(relayerFee));
  }
  return volume;
}
