import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const tickersURL = "https://api.bitflowapis.finance/ticker";
const dlmmTickersURL = "https://bff.bitflowapis.finance/api/app/v1/tickers";
const tokensURL = "https://api.bitflowapis.finance/getAllTokensAndPools";

interface Ticker {
  base_currency: string;
  base_volume: number;
}

interface Token {
  tokenContract: string;
  priceData: {
    last_price: number;
  };
}

const isStacksToken = (tokenContract: string) => {
  return (
    tokenContract === "Stacks" ||
    tokenContract ===
      "SM1793C4R5PZ4NS4VQ4WMP7SKKYVH8JZEWSZ9HCCR.token-stx-v-1-2"
  );
};

const getTokenPricesMap = async () => {
  const {
    tokens,
  }: {
    tokens: Token[];
  } = await fetchURL(tokensURL);

  const tokenPricesMap: { [tokenContract: string]: number } = {};
  for (const token of tokens) {
    if (!token.priceData)
      tokenPricesMap[token.tokenContract] = 0;
    else
      tokenPricesMap[token.tokenContract] = token.priceData.last_price;
  }
  return tokenPricesMap;
};

const getTokenDailyVolume = ({
  map,
  tokenContract,
  baseVolume,
}: {
  map: { [tokenContract: string]: number };
  tokenContract: string;
  baseVolume: number;
}) => {
  const tokenPrice = map[tokenContract];
  if (!tokenPrice) return 0;
  return baseVolume * tokenPrice;
};

const fetch = async (): Promise<FetchResult> => {
  const [tickers, dlmmTickers, tokensPriceMap] = await Promise.all([
    fetchURL(tickersURL),
    fetchURL(dlmmTickersURL),
    getTokenPricesMap(),
  ]);

  let dailyVolume = 0;

  for (const ticker of [...tickers, ...dlmmTickers]) {
    const baseVolume = Number(ticker.base_volume);
    if (!Number.isFinite(baseVolume)) continue;

    const tokenContract = isStacksToken(ticker.base_currency)
      ? "null"
      : ticker.base_currency;

    dailyVolume += getTokenDailyVolume({
      map: tokensPriceMap,
      tokenContract,
      baseVolume,
    });
  }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;
