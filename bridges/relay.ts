import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { httpGet } from "../utils/fetchURL";

// Relay cross-chain requests from Relay's API.
// https://docs.relay.link/references/api/get-requests
const API = "https://api.relay.link/requests/v3";
const PAGE_DELAY_MS = 350; // ~170 requests a minute, under the ~180/min the old adapter ran at
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

// Relay chain id -> DefiLlama chain (https://api.relay.link/chains)
const RELAY_CHAINS: Record<number, string> = {
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
const USD_PRICED = new Set([1337, 8253038, 537724, 224235520, 9286185]);
const SOLANA = 792703809;
const SOL_NATIVE = "11111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";

type Leg = { currency: { chainId: number; address: string }; amount: string; amountUsd?: string };
type RelayRequest = {
  status: string;
  data?: {
    metadata?: { currencyIn?: Leg; currencyOut?: Leg };
    route?: Record<"actual" | "quoted", { origin?: { inputCurrency?: Leg; outputCurrency?: Leg }; destination?: { inputCurrency?: Leg } } | undefined>;
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getPage = async (url: string, apiKey: string) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await httpGet(url, { headers: { "x-api-key": apiKey } });
    } catch (e: any) {
      const status = e?.axiosError?.response?.status ?? e?.response?.status;
      // rate limits and server errors are retried with backoff, anything else is a real failure
      if (attempt >= RETRY_DELAYS_MS.length || !(status === 429 || status >= 500)) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
};

// one paged pull per window, shared by every chain
const prefetch = async (options: FetchOptions): Promise<RelayRequest[]> => {
  const apiKey = getEnv("RELAY_API_KEY");
  if (!apiKey) throw new Error("relay: RELAY_API_KEY is required");
  const requests: RelayRequest[] = [];
  let continuation: string | undefined;
  do {
    const page = await getPage(`${API}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}&limit=100&sortBy=createdAt&sortDirection=asc${continuation ? `&continuation=${encodeURIComponent(continuation)}` : ""}`, apiKey);
    if (!Array.isArray(page?.requests)) throw new Error("relay: unexpected API response");
    requests.push(...page.requests);
    continuation = page.continuation;
    if (continuation) await sleep(PAGE_DELAY_MS);
  } while (continuation);
  return requests.filter((r) => r.status === "success");
};

// v3 responses carry the legs in data.metadata like v2; fall back to the settled route the old adapter read
const getLegs = (request: RelayRequest): [Leg | undefined, Leg | undefined] => {
  const metadata = request.data?.metadata;
  if (metadata?.currencyIn && metadata?.currencyOut) return [metadata.currencyIn, metadata.currencyOut];
  const route = request.data?.route?.actual ?? request.data?.route?.quoted;
  return [route?.origin?.inputCurrency, route?.destination?.inputCurrency ?? route?.origin?.outputCurrency];
};

const addLeg = (balances: any, leg: Leg) => {
  const { chainId, address } = leg.currency;
  if (USD_PRICED.has(chainId)) {
    const usd = Number(leg.amountUsd);
    if (!Number.isFinite(usd)) throw new Error(`relay: no USD amount for a chain ${chainId} leg`);
    return balances.addUSDValue(usd);
  }
  const token = chainId === SOLANA && address === SOL_NATIVE ? WSOL : address.startsWith("0x") ? address.toLowerCase() : address;
  balances.add(token, leg.amount);
};

const fetch = async (options: FetchOptions) => {
  const requests: RelayRequest[] = options.preFetchedResults;
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const request of requests) {
    const [legIn, legOut] = getLegs(request);
    if (!legIn || !legOut || legIn.currency.chainId === legOut.currency.chainId) continue;
    if (RELAY_CHAINS[legIn.currency.chainId] === options.chain) {
      addLeg(dailyOutgoingVolume, legIn);
      dailyOutgoingTxCount++;
    }
    if (RELAY_CHAINS[legOut.currency.chainId] === options.chain) {
      addLeg(dailyIncomingVolume, legOut);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(RELAY_CHAINS))],
  start: "2025-08-28", // first day the old bridges server recorded Relay volume
  methodology: {
    OutgoingVolume: "Value of tokens sent from each chain through successful Relay cross-chain requests, priced from the token and amount; same-chain swaps excluded.",
    IncomingVolume: "Value of tokens delivered to each chain through successful Relay cross-chain requests, priced from the token and amount; same-chain swaps excluded.",
    OutgoingTxCount: "Number of successful Relay cross-chain requests sent from each chain.",
    IncomingTxCount: "Number of successful Relay cross-chain requests delivered to each chain.",
  },
};

export default adapter;
