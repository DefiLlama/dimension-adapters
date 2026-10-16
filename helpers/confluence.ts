import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";
import fetchURL from "../utils/fetchURL";

// Confluence (https://confluencebuild.xyz) is a non-custodial app that moves USDC in and out of
// Arc through Circle CCTP and routes other chains and tokens through Relay. It has no contracts of
// its own, so activity is read from its public stats API, which counts only transfers proven
// on-chain: CCTP bridges verified against Circle's attestation data, swaps confirmed on-chain,
// Arc payments proven on Arc, and Relay routes Relay reported as successful.
// API docs: https://docs.confluencebuild.xyz
const STATS_URL = "https://api.confluencebuild.xyz/public/stats/daily";

// Mainnet launch day; there is no earlier data.
export const CONFLUENCE_START = "2026-09-27";

// EVM chain id (as reported by the API) -> DefiLlama chain key.
// Codex (81224) and Edge (3343) are also supported by Confluence but have no DefiLlama chain key yet.
export const CONFLUENCE_CHAINS: Record<number, string> = {
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
};

interface Product {
  count: number;
  volumeUsdc?: string;
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
  relayBridge?: Product;
}
export interface ConfluenceDay {
  date: string;
  transactions: number;
  activeWallets: number;
  newWallets: number;
  chains: ChainDay[];
}

// One request per UTC day serves every chain (use from prefetch).
export async function fetchConfluenceDay(options: FetchOptions): Promise<ConfluenceDay> {
  const res = await fetchURL(`${STATS_URL}?from=${options.dateString}&to=${options.dateString}`);
  const day = res?.days?.find((d: ConfluenceDay) => d.date === options.dateString);
  if (!day) throw new Error(`Confluence stats API returned no data for ${options.dateString}`);
  return day;
}

// The day's numbers for the chain being fetched (undefined when there was no activity there).
export function confluenceChainDay(options: FetchOptions): ChainDay | undefined {
  const day: ConfluenceDay = options.preFetchedResults;
  return day.chains.find((c) => c.evmChainId !== null && CONFLUENCE_CHAINS[c.evmChainId] === options.chain);
}
