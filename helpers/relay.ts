import { CHAIN } from "./chains";
import { getEnv } from "./env";
import { httpGet } from "../utils/fetchURL";

// Relay cross-chain requests from Relay's API, shared by bridges/relay and fees/relay.
// https://docs.relay.link/references/api/get-requests
export const RELAY_REQUESTS_API = "https://api.relay.link/requests/v3";
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

// Relay chain id -> DefiLlama chain (https://api.relay.link/chains)
export const RELAY_CHAINS: Record<number, string> = {
  1: CHAIN.ETHEREUM, 10: CHAIN.OPTIMISM, 25: CHAIN.CRONOS, 56: CHAIN.BSC, 100: CHAIN.XDAI, 130: CHAIN.UNICHAIN, 137: CHAIN.POLYGON,
  143: CHAIN.MONAD, 146: CHAIN.SONIC, 169: CHAIN.MANTA, 196: CHAIN.XLAYER, 288: CHAIN.BOBA, 324: CHAIN.ERA, 360: CHAIN.SHAPE,
  480: CHAIN.WC, 747: CHAIN.FLOW, 988: CHAIN.STABLE, 999: CHAIN.HYPERLIQUID, 1088: CHAIN.METIS, 1135: CHAIN.LISK,
  1337: CHAIN.HYPERLIQUID, // HyperCore, booked with HyperEVM under hyperliquid
  1868: CHAIN.SONEIUM, 2020: CHAIN.RONIN, 2741: CHAIN.ABSTRACT, 2818: CHAIN.MORPH, 4217: CHAIN.TEMPO, 4326: CHAIN.MEGAETH,
  4663: CHAIN.ROBINHOOD, 5000: CHAIN.MANTLE, 5031: CHAIN.SOMNIA, 5042: CHAIN.ARC, 8453: CHAIN.BASE, 9745: CHAIN.PLASMA,
  33139: CHAIN.APECHAIN, 34443: CHAIN.MODE, 42018: CHAIN.MYTHOS, 42161: CHAIN.ARBITRUM, 42220: CHAIN.CELO, 43114: CHAIN.AVAX,
  48900: CHAIN.ZIRCUIT, 57073: CHAIN.INK, 59144: CHAIN.LINEA, 60808: CHAIN.BOB, 80094: CHAIN.BERACHAIN, 81457: CHAIN.BLAST,
  97477: CHAIN.DOMA, 98866: CHAIN.PLUME, 534352: CHAIN.SCROLL, 537724: CHAIN.RIPPLE, 685689: CHAIN.GENSYN, 747474: CHAIN.KATANA,
  5064014: CHAIN.ETHEREAL, 7777777: CHAIN.ZORA, 8253038: CHAIN.BITCOIN, 9286185: CHAIN.ECLIPSE, 224235520: CHAIN.TON,
  728126428: CHAIN.TRON, 792703809: CHAIN.SOLANA,
  // superseed (5330), lighter (3586256), robinhood-lighter (548123634): no CHAIN key
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const getRelayApiKey = () => {
  const apiKey = getEnv("RELAY_API_KEY");
  if (!apiKey) throw new Error("relay: RELAY_API_KEY is required");
  return apiKey;
};

export const getRelayPage = async (url: string, apiKey: string) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const page = await httpGet(url, { headers: { "x-api-key": apiKey } });
      if (!Array.isArray(page?.requests)) throw new Error("relay: unexpected API response");
      return page;
    } catch (e: any) {
      const status = e?.axiosError?.response?.status ?? e?.response?.status;
      // rate limits and server errors are retried with backoff, anything else is a real failure
      if (attempt >= RETRY_DELAYS_MS.length || !(status === 429 || status >= 500)) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
};
