import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Metro (formerly Thorswap) publishes its daily USD volume per INPUT chain (the
// chain the user swaps from). One request returns every chain's volume for a
// UTC day, keyed by the chain code (BTC, THOR, GAIA, POL, ...), which we map to
// each DefiLlama chain below. BNB (Binance Beacon Chain, retired in 2024) has
// no DefiLlama chain of its own, so its volume is counted under bsc.

// [DefiLlama CHAIN, chain codes, start date (first day with volume)]
const CHAINS: Array<[string, string[], string]> = [
  [CHAIN.BITCOIN, ["BTC"], "2022-06-02"],
  [CHAIN.ETHEREUM, ["ETH"], "2022-06-01"],
  [CHAIN.THORCHAIN, ["THOR"], "2021-04-01"],
  [CHAIN.TRON, ["TRON"], "2025-07-17"],
  [CHAIN.SOLANA, ["SOL"], "2024-09-26"],
  [CHAIN.ZEC, ["ZEC"], "2025-08-21"],
  [CHAIN.RIPPLE, ["XRP"], "2025-06-05"],
  [CHAIN.BSC, ["BSC", "BNB"], "2022-06-01"],
  [CHAIN.LITECOIN, ["LTC"], "2022-06-10"],
  [CHAIN.ARBITRUM, ["ARB"], "2024-05-02"],
  [CHAIN.MAYA, ["MAYA"], "2024-04-01"],
  [CHAIN.DOGE, ["DOGE"], "2022-07-26"],
  [CHAIN.BASE, ["BASE"], "2025-01-14"],
  [CHAIN.AVAX, ["AVAX"], "2022-10-03"],
  [CHAIN.COSMOS, ["GAIA"], "2022-07-14"],
  [CHAIN.BITCOIN_CASH, ["BCH"], "2022-06-19"],
  [CHAIN.POLYGON, ["POL"], "2025-10-29"],
  [CHAIN.NEAR, ["NEAR"], "2025-10-16"],
  [CHAIN.DASH, ["DASH"], "2024-05-07"],
  [CHAIN.OPTIMISM, ["OP"], "2025-10-02"],
  [CHAIN.RADIXDLT, ["XRD"], "2024-09-03"],
  [CHAIN.SUI, ["SUI"], "2025-12-01"],
  [CHAIN.KUJIRA, ["KUJI"], "2024-05-13"],
  [CHAIN.POLKADOT, ["DOT"], "2024-02-29"],
  [CHAIN.TON, ["TON"], "2026-03-19"],
  [CHAIN.MONAD, ["MONAD"], "2025-11-24"],
  [CHAIN.CARDANO, ["ADA"], "2026-02-18"],
  [CHAIN.XDAI, ["GNO"], "2026-01-13"],
  [CHAIN.BERACHAIN, ["BERA"], "2026-01-13"],
  [CHAIN.STARKNET, ["STRK"], "2026-02-05"],
  [CHAIN.XLAYER, ["XLAYER"], "2025-12-11"],
  [CHAIN.STELLAR, ["XLM"], "2026-06-15"],
  [CHAIN.ALEO, ["ALEO"], "2026-07-30"],
  [CHAIN.ROBINHOOD, ["HOOD"], "2026-09-05"],
  [CHAIN.HYPERLIQUID, ["HYPEREVM"], "2026-10-11"],
];

// The API's largest page. Metro has volume on fewer chains than this on any
// day, so the page always holds all of them.
const PAGE_SIZE = 50;

type DailyShares = {
  shares: Array<{ key: string; volume: string; share: string }>;
  other: { volume: string; share: string } | null;
};

// Amounts are dollar strings with two decimals, summed in whole cents so a
// chain with two codes carries no floating-point dust.
const toCents = (usd: string) => Math.round(Number(usd) * 100);

// Every chain's fetch for a day reads the same response, so it is requested
// once per day rather than once per chain.
const dailyVolumes = new Map<string, Promise<Record<string, number>>>();

const getDailyVolumes = (date: string) => {
  let volumes = dailyVolumes.get(date);
  if (!volumes) {
    volumes = httpGet(
      `https://metro.exchange/api/v1/stats/volume/shares?by=chain_in&from=${date}&to=${date}&limit=${PAGE_SIZE}`,
    ).then((data: DailyShares) => {
      // A remainder means some chain fell off the page and would be missed.
      if (data.other) throw new Error(`More than ${PAGE_SIZE} chains on ${date}`);
      return Object.fromEntries(data.shares.map(({ key, volume }) => [key, toCents(volume)]));
    });
    // A failed request is not cached, so a retry asks again.
    volumes.catch(() => dailyVolumes.delete(date));
    dailyVolumes.set(date, volumes);
  }
  return volumes;
};

const fetchVolume = (codes: string[]) => async (options: FetchOptions) => {
  const volumes = await getDailyVolumes(options.dateString);
  // A chain with no swaps that day is absent from the response.
  const cents = codes.reduce((sum, code) => sum + (volumes[code] ?? 0), 0);
  return { dailyVolume: cents / 100 };
};

const adapter: SimpleAdapter = {
  // Swaps settle on the providers Metro routes through (THORChain, Maya,
  // Chainflip, NEAR Intents), which DefiLlama already tracks.
  doublecounted: true,
  adapter: Object.fromEntries(
    CHAINS.map(([chain, codes, start]) => [chain, { fetch: fetchVolume(codes), start }]),
  ),
  methodology: {
    Volume: `Volume is sourced from Metro's (formerly Thorswap) public stats API, which aggregates completed swaps across every provider it routes through (THORChain, Maya, Chainflip, NEAR Intents and others). Each swap is attributed to its input chain (the chain swapped from) to avoid double-counting the buy and sell legs, and is valued in USD at the time of the swap.`,
  },
};

export default adapter;
