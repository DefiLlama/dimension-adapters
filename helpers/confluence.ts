import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import fetchURL from "../utils/fetchURL";

// Confluence (https://confluencebuild.xyz) is a non-custodial app that moves USDC in and out of
// Arc through Circle CCTP and routes other chains and tokens through Relay. It has no contracts of
// its own, so activity is read from its public stats API, which counts only transfers proven
// on-chain: CCTP bridges verified against Circle's attestation data, swaps confirmed on-chain,
// Arc payments proven on Arc, and Relay routes Relay reported as successful.
// Docs: https://docs.confluencebuild.xyz
const STATS_URL = "https://api.confluencebuild.xyz/public/stats/daily";

/** Mainnet launch day; there is no earlier data. */
export const CONFLUENCE_START = "2026-09-27";

/**
 * EVM chain id (as reported by the API) -> DefiLlama chain key.
 * The first group are Confluence's CCTP bridge chains. The second group are other chains that
 * Relay routes started from Confluence can originate on.
 * Codex (81224) and Edge (3343) are CCTP chains with no DefiLlama chain key yet, so not reported.
 */
export const CONFLUENCE_CHAINS: Record<number, string> = {
  // CCTP bridge chains (also Relay origins)
  5042: CHAIN.ARC,
  1: CHAIN.ETHEREUM,
  42161: CHAIN.ARBITRUM,
  43114: CHAIN.AVAX,
  8453: CHAIN.BASE,
  10: CHAIN.OPTIMISM,
  137: CHAIN.POLYGON,
  59144: CHAIN.LINEA,
  130: CHAIN.UNICHAIN,
  146: CHAIN.SONIC,
  480: CHAIN.WC,
  1329: CHAIN.SEI,
  50: CHAIN.XDC,
  999: CHAIN.HYPERLIQUID,
  57073: CHAIN.INK,
  98866: CHAIN.PLUME,
  143: CHAIN.MONAD,
  // Relay-only origin chains
  56: CHAIN.BSC,
  534352: CHAIN.SCROLL,
  169: CHAIN.MANTA,
  324: CHAIN.ERA,
  81457: CHAIN.BLAST,
  5000: CHAIN.MANTLE,
  42220: CHAIN.CELO,
  100: CHAIN.XDAI,
  34443: CHAIN.MODE,
  167000: CHAIN.TAIKO,
  80094: CHAIN.BERACHAIN,
  2741: CHAIN.ABSTRACT,
  1868: CHAIN.SONEIUM,
  252: CHAIN.FRAXTAL,
  1135: CHAIN.LISK,
  33139: CHAIN.APECHAIN,
  60808: CHAIN.BOB,
  747474: CHAIN.KATANA,
  9745: CHAIN.PLASMA,
  1923: CHAIN.SWELLCHAIN,
  2818: CHAIN.MORPH,
  25: CHAIN.CRONOS,
  204: CHAIN.OP_BNB,
};

interface Product {
  count: number;
  /** USDC, human-readable (CCTP bridges and Arc payments). */
  volumeUsdc?: string;
  /** USD (swaps and Relay routes). */
  volumeUsd?: number;
}

interface ChainDay {
  chain: string;
  evmChainId: number | null;
  transactions: number;
  activeWallets: number;
  newWallets: number;
  bridge: Product;
  swap: Product;
  arcPay: Product;
  relay: Product;
  /** Cross-chain Relay routes only (subset of relay). */
  relayBridge?: Product;
}

/** One UTC day of Confluence activity, as returned by the stats API. */
export interface ConfluenceDay {
  date: string;
  transactions: number;
  /** Wallets active that day, deduplicated across chains. */
  activeWallets: number;
  /** Wallets whose first ever action was that day, across chains. */
  newWallets: number;
  chains: ChainDay[];
}

interface StatsResponse {
  from: string;
  to: string;
  days: ConfluenceDay[];
}

/**
 * Fetches one UTC day of stats for every chain in a single request (used as `prefetch`).
 * Throws when the API has no entry for the day, rather than reporting zeros.
 */
export async function fetchConfluenceDay(options: FetchOptions): Promise<ConfluenceDay> {
  const res: StatsResponse = await fetchURL(`${STATS_URL}?from=${options.dateString}&to=${options.dateString}`);
  const day = res.days.find((d) => d.date === options.dateString);
  if (!day) throw new Error(`Confluence stats API returned no data for ${options.dateString}`);
  return day;
}

/**
 * The prefetched day's numbers for the chain being fetched.
 * Returns undefined when Confluence had no activity on that chain that day.
 */
export function confluenceChainDay(options: FetchOptions): ChainDay | undefined {
  const day: ConfluenceDay = options.preFetchedResults;
  return day.chains.find((c) => c.evmChainId !== null && CONFLUENCE_CHAINS[c.evmChainId] === options.chain);
}
