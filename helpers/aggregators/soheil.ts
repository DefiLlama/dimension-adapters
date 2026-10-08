// helpers/aggregators/soheil.ts — shared by aggregators/soheil and bridge-aggregators/soheil: our network ids (LI.FI's numbering for EVM chains, LI.FI-style ids for the
// rest) → DefiLlama chain keys. Volume on a network that is not listed here is left out rather than guessed.
import { CHAIN } from "../chains";
import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

export const SOHEIL_CHAINS: Record<string, string> = {
  "1": CHAIN.ETHEREUM,
  "10": CHAIN.OPTIMISM,
  "56": CHAIN.BSC,
  "137": CHAIN.POLYGON,
  "8453": CHAIN.BASE,
  "42161": CHAIN.ARBITRUM,
  "43114": CHAIN.AVAX,
  "59144": CHAIN.LINEA,
  "999": CHAIN.HYPERLIQUID, // HyperEVM
  "964": CHAIN.BITTENSOR, // Bittensor EVM
  "728126428": CHAIN.TRON,
  "1151111081099710": CHAIN.SOLANA,
  "9270000000000000": CHAIN.SUI,
  "6070000000000000": CHAIN.TON,
  "20000000000001": CHAIN.BITCOIN,
  "8800000000000001": CHAIN.NEAR,
  "8800000000000002": CHAIN.ZEC,
  "8800000000000003": CHAIN.RIPPLE,
  "8800000000000004": CHAIN.CARDANO,
  "8800000000000005": CHAIN.DOGE,
  "8800000000000006": CHAIN.LITECOIN,
};

export const SOHEIL_START = "2026-10-01";
// One UTC day per request (?day=YYYY-MM-DD), so any date can be filled or refilled; public, no key
export const SOHEIL_VOLUME_API = "https://soheil.fi/api/site/volume";

interface SoheilDay {
  day: string; // YYYY-MM-DD, UTC
  trades: number;
  volumeUsd: number;
  swaps: { chainId: number; trades: number; volumeUsd: number }[];
  bridges: { fromChainId: number; toChainId: number; trades: number; volumeUsd: number }[];
}

/** The chains DefiLlama shows us on (each once). */
export const SOHEIL_CHAIN_LIST = [...new Set(Object.values(SOHEIL_CHAINS))];

/**
 * Prefetch, one request per run for all chains: the day being filled (options.dateString), flattened to
 * "swap:<chain>" and "bridge:<chain>" (source chain) → USD. Networks missing from SOHEIL_CHAINS are left out.
 */
export async function fetchSoheilDay(options: FetchOptions): Promise<Record<string, number>> {
  const days: SoheilDay[] = await httpGet(`${SOHEIL_VOLUME_API}?day=${options.dateString}`);
  if (!days.length) {
    throw new Error(`No data found for ${options.dateString}`);
  }
  const volumes: Record<string, number> = {};
  const add = (key: string, usd: number) => {
    volumes[key] = (volumes[key] ?? 0) + usd;
  };
  for (const day of days) {
    for (const s of day.swaps) {
      const chain = SOHEIL_CHAINS[String(s.chainId)];
      if (chain) add(`swap:${chain}`, s.volumeUsd);
    }
    for (const b of day.bridges) {
      const chain = SOHEIL_CHAINS[String(b.fromChainId)];
      if (chain) add(`bridge:${chain}`, b.volumeUsd);
    }
  }
  return volumes;
}
