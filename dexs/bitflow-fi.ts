import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const tickersURL = "https://api.bitflowapis.finance/ticker";
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

const getTokenPricesMap = async () => {
  const {
    tokens,
  }: {
    tokens: Token[];
  } = await fetchURL(tokensURL);

  const tokenPricesMap: { [tokenContract: string]: number } = {};
  for (const token of tokens) {
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
  const dayTimestamp = getUniqStartOfTodayTimestamp();
  const tickers: Ticker[] = await fetchURL(tickersURL);
  const tokensPriceMap = await getTokenPricesMap();

  let dailyVolume = 0;

  for (const ticker of tickers) {
    const tokenContract =
      ticker.base_currency === "Stacks" ? "null" : ticker.base_currency;

    dailyVolume += getTokenDailyVolume({
      map: tokensPriceMap,
      tokenContract,
      baseVolume: ticker.base_volume,
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
