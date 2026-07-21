import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const tickersURL = "https://api.bitflowapis.finance/ticker";
const dlmmTickersURL = "https://bff.bitflowapis.finance/api/app/v1/tickers";
const tokensURL = "https://api.bitflowapis.finance/getAllTokensAndPools";

// STX has no SIP-010 contract, so the tokens API keys its price under the string "null"
const STX_PRICE_KEY = "null";

interface Ticker {
  pool_id: string;
  base_currency: string;
  base_volume: number;
  target_currency: string;
  target_volume: number;
}

interface Token {
  tokenContract: string;
  priceData: { last_price: number } | null;
}

const isStacksToken = (currency: string) =>
  currency === "Stacks" ||
  currency === "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2";

const priceKey = (currency: string) =>
  isStacksToken(currency) ? STX_PRICE_KEY : currency;

const getTokenPricesMap = async () => {
  const { tokens }: { tokens: Token[] } = await fetchURL(tokensURL);
  const map: { [key: string]: number } = {};
  for (const token of tokens)
    map[token.tokenContract] = token.priceData ? token.priceData.last_price : 0;
  return map;
};

// value a pool by whichever side has a price — the two sides of a swap are ~equal value,
// so this recovers pools whose base token is unpriced (e.g. memecoin/STX pairs)
const tickerVolume = (ticker: Ticker, prices: { [key: string]: number }) => {
  const baseVolume = Number(ticker.base_volume);
  const basePrice = prices[priceKey(ticker.base_currency)] || 0;
  if (Number.isFinite(baseVolume) && basePrice) return baseVolume * basePrice;

  const targetVolume = Number(ticker.target_volume);
  const targetPrice = prices[priceKey(ticker.target_currency)] || 0;
  if (Number.isFinite(targetVolume) && targetPrice) return targetVolume * targetPrice;

  return 0;
};

const fetch = async (): Promise<FetchResult> => {
  const [tickers, dlmmTickers, prices]: [Ticker[], Ticker[], { [key: string]: number }] =
    await Promise.all([
      fetchURL(tickersURL),
      fetchURL(dlmmTickersURL),
      getTokenPricesMap(),
    ]);

  // STX is the dominant traded asset — fail loudly rather than silently drop >50% of
  // volume if the tokens API ever stops keying STX under "null"
  if (!prices[STX_PRICE_KEY])
    throw new Error("bitflow: STX price missing from tokens API");

  // the /ticker feed already includes the DLMM pools, so de-duplicate by pool_id to
  // avoid counting DLMM volume twice (it also appears in the dedicated DLMM feed)
  const seen = new Set<string>();
  let dailyVolume = 0;
  for (const ticker of [...tickers, ...dlmmTickers]) {
    if (seen.has(ticker.pool_id)) continue;
    seen.add(ticker.pool_id);
    dailyVolume += tickerVolume(ticker, prices);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STACKS],
  runAtCurrTime: true,
  methodology: {
    Volume:
      "Sum of each Bitflow pool's 24h traded volume valued in USD across StableSwap, XYK and DLMM pools.",
  },
};

export default adapter;
