import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getRelayApiKey, getRelayPage, RELAY_CHAINS, RELAY_REQUESTS_API } from "../helpers/relay";

const USD_PRICED = new Set([1337, 8253038, 537724, 224235520, 9286185]);
const SOLANA = 792703809;
const SOL_NATIVE = "11111111111111111111111111111111";
const WSOL = ADDRESSES.solana.SOL;

type Leg = { currency: { chainId: number; address: string }; amount: string; amountUsd?: string };
type RelayRequest = {
  status: string;
  data?: {
    metadata?: { currencyIn?: Leg; currencyOut?: Leg };
    route?: Record<"actual" | "quoted", { origin?: { inputCurrency?: Leg; outputCurrency?: Leg }; destination?: { inputCurrency?: Leg } } | undefined>;
  };
};

// v3 responses carry the legs in data.metadata like v2; fall back to the settled route the old adapter read
const getLegs = (request: RelayRequest): [Leg | undefined, Leg | undefined] => {
  const metadata = request.data?.metadata;
  if (metadata?.currencyIn && metadata?.currencyOut) return [metadata.currencyIn, metadata.currencyOut];
  const route = request.data?.route?.actual ?? request.data?.route?.quoted;
  return [route?.origin?.inputCurrency, route?.destination?.inputCurrency ?? route?.origin?.outputCurrency];
};

// keep only the fields fetch reads, so the full request objects can be freed page by page
const slimLeg = ({ currency, amount, amountUsd }: Leg): Leg => ({ currency: { chainId: currency.chainId, address: currency.address }, amount, amountUsd });

// one paged pull per window, shared by every chain: the [in, out] legs of each successful cross-chain request.
// Pages are capped at 100 and fetched one at a time with no fixed delay: ~70 requests a minute, under the 180/min
// the old bridges-server adapter ran in production. 429s and server errors back off and retry.
const prefetch = async (options: FetchOptions): Promise<[Leg, Leg][]> => {
  const apiKey = getRelayApiKey();
  const transfers: [Leg, Leg][] = [];
  let continuation: string | undefined;
  do {
    const page = await getRelayPage(`${RELAY_REQUESTS_API}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}&limit=100&sortBy=createdAt&sortDirection=asc${continuation ? `&continuation=${encodeURIComponent(continuation)}` : ""}`, apiKey);
    for (const request of page.requests as RelayRequest[]) {
      if (request.status !== "success") continue;
      const [legIn, legOut] = getLegs(request);
      // same-chain swaps are not bridging
      if (!legIn || !legOut || legIn.currency.chainId === legOut.currency.chainId) continue;
      transfers.push([slimLeg(legIn), slimLeg(legOut)]);
    }
    continuation = page.continuation;
  } while (continuation);
  return transfers;
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
  const transfers: [Leg, Leg][] = options.preFetchedResults;
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const [legIn, legOut] of transfers) {
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
