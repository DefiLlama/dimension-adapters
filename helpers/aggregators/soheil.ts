// helpers/aggregators/soheil.ts — shared by aggregators/soheil and bridge-aggregators/soheil: every network Soheil.fi supports
// (LI.FI's numbering for EVM chains, LI.FI-style ids for the rest) → DefiLlama chain keys. A network missing here would be left
// out of the volume, so this list follows https://soheil.fi/api/chains (all 84 networks as of 2026-10-11).
import { CHAIN } from "../chains";
import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

export const SOHEIL_CHAINS: Record<string, string> = {
  // EVM networks (chain id = LI.FI's)
  "1": CHAIN.ETHEREUM,
  "10": CHAIN.OPTIMISM,
  "14": CHAIN.FLARE,
  "25": CHAIN.CRONOS,
  "30": CHAIN.ROOTSTOCK,
  "40": CHAIN.TELOS,
  "50": CHAIN.XDC,
  "56": CHAIN.BSC,
  "88": CHAIN.TOMOCHAIN, // Viction
  "100": CHAIN.XDAI, // Gnosis
  "122": CHAIN.FUSE,
  "130": CHAIN.UNICHAIN,
  "137": CHAIN.POLYGON,
  "143": CHAIN.MONAD,
  "146": CHAIN.SONIC,
  "196": CHAIN.XLAYER,
  "204": CHAIN.OP_BNB,
  "232": CHAIN.LENS,
  "252": CHAIN.FRAXTAL,
  "288": CHAIN.BOBA,
  "324": CHAIN.ERA, // zkSync Era
  "480": CHAIN.WC, // World Chain
  "747": CHAIN.FLOW, // Flow EVM
  "988": CHAIN.STABLE,
  "999": CHAIN.HYPERLIQUID, // HyperEVM
  "1088": CHAIN.METIS,
  "1135": CHAIN.LISK,
  "1329": CHAIN.SEI,
  "1337": CHAIN.HYPERLIQUID, // HyperCore
  "1480": CHAIN.VANA,
  "1625": CHAIN.GRAVITY,
  "1672": CHAIN.PHAROS,
  "1776": CHAIN.INJECTIVE,
  "1868": CHAIN.SONEIUM,
  "2020": CHAIN.RONIN,
  "2741": CHAIN.ABSTRACT,
  "2818": CHAIN.MORPH,
  "4217": CHAIN.TEMPO,
  "4326": CHAIN.MEGAETH,
  "4663": CHAIN.ROBINHOOD, // Robinhood Chain
  "5000": CHAIN.MANTLE,
  "5031": CHAIN.SOMNIA,
  "5042": CHAIN.ARC,
  "8217": CHAIN.KLAYTN, // Kaia
  "8453": CHAIN.BASE,
  "9745": CHAIN.PLASMA,
  "13371": CHAIN.IMMUTABLEX, // Immutable zkEVM
  "16661": CHAIN.OG, // 0G
  "33139": CHAIN.APECHAIN,
  "34443": CHAIN.MODE,
  "42161": CHAIN.ARBITRUM,
  "42170": CHAIN.ARBITRUM_NOVA,
  "42220": CHAIN.CELO,
  "42793": CHAIN.ETHERLINK,
  "43111": CHAIN.HEMI,
  "43114": CHAIN.AVAX,
  "57073": CHAIN.INK,
  "59144": CHAIN.LINEA,
  "60808": CHAIN.BOB,
  "80094": CHAIN.BERACHAIN,
  "81457": CHAIN.BLAST,
  "98866": CHAIN.PLUME,
  "534352": CHAIN.SCROLL,
  "747474": CHAIN.KATANA,
  "3586256": CHAIN.ZK_LIGHTER, // Lighter
  "728126428": CHAIN.TRON,
  "964": CHAIN.BITTENSOR, // Bittensor EVM
  // Other networks (LI.FI-style ids; 88000000000000xx = networks reached through NEAR Intents)
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
  "8800000000000007": CHAIN.BITCOIN_CASH,
  "8800000000000008": CHAIN.DASH,
  "8800000000000009": CHAIN.STELLAR,
  "8800000000000010": CHAIN.APTOS,
  "8800000000000011": CHAIN.STARKNET,
  "8800000000000012": CHAIN.ALEO,
  "8800000000000013": CHAIN.MOVE, // Movement
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
