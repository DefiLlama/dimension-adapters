// helpers/aggregators/soheil.ts — shared by aggregators/soheil and bridge-aggregators/soheil: our network ids (LI.FI's numbering for EVM chains, LI.FI-style ids for the
// rest) → DefiLlama chain keys. Volume on a network that is not listed here is left out rather than guessed.
import { CHAIN } from "../chains";
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
export const SOHEIL_VOLUME_API = "https://soheil.fi/api/site/volume?days=400";

export interface SoheilDay {
  day: string; // YYYY-MM-DD, UTC
  trades: number;
  volumeUsd: number;
  swaps: { chainId: number; trades: number; volumeUsd: number }[];
  bridges: { fromChainId: number; toChainId: number; trades: number; volumeUsd: number }[];
}

/** The chains DefiLlama shows us on (each once). */
export const SOHEIL_CHAIN_LIST = [...new Set(Object.values(SOHEIL_CHAINS))];

/**
 * One request per run for all chains: every UTC day since the start (verified trades only), keyed by day. Typed loosely
 * because the runner types prefetch results as dimension results; the adapters read it as SoheilDays.
 */
export const fetchSoheilDays = async (): Promise<any> => {
  const days: SoheilDay[] = await httpGet(SOHEIL_VOLUME_API);
  return Object.fromEntries(days.map((d) => [d.day, d]));
};

export type SoheilDays = Record<string, SoheilDay | undefined>;
