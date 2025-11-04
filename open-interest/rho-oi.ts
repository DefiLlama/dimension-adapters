import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const EXCHANGE_INFO_URL = "https://x.rho.trading/api/v1/exchange/info";
const TICKERS_URL = "https://x.rho.trading/api/v1/tickers";
const TARGET_CURRENCY = "USD";

const buildSourceCurrencyToRateMap = (currencyRates: any, targetCurrency: string): Map<string, number> => {
  const rateMap = new Map<string, number>();
  if (!Array.isArray(currencyRates)) {
    return rateMap;
  }

  const targetCurrencyEntry = currencyRates.find((rateEntry: any) => rateEntry?.targetCurrency === targetCurrency);
  if (!targetCurrencyEntry || !Array.isArray(targetCurrencyEntry.sourceCurrencyToValues)) {
    return rateMap;
  }

  for (const sourceRate of targetCurrencyEntry.sourceCurrencyToValues) {
    const sourceCurrency = sourceRate?.sourceCurrency;
    const rawValue = sourceRate?.value?.value ?? sourceRate?.value;
    const numericValue = typeof rawValue === "string" || typeof rawValue === "number" ? Number(rawValue) : NaN;
    if (typeof sourceCurrency === "string" && sourceCurrency.length > 0 && Number.isFinite(numericValue) && numericValue > 0) {
      rateMap.set(sourceCurrency, numericValue);
    }
  }

  return rateMap;
};

const convertAmountToTargetCurrency = (amount: number, sourceCurrency: string, rateMap: Map<string, number>): number | null => {
  if (!Number.isFinite(amount)) {
    return null;
  }
  const rate = rateMap.get(sourceCurrency);
  if (rate === undefined || rate <= 0) {
    return null;
  }
  return amount / rate;
};

const fetch = async () => {
  const exchangeInfo = await httpGet(EXCHANGE_INFO_URL);
  const tradableSymbolRecords = Array.isArray(exchangeInfo?.symbols)
    ? exchangeInfo.symbols.filter((symbolRecord: any) => symbolRecord && symbolRecord.isExpired === false)
    : []; 
  const tradableSymbols = tradableSymbolRecords
    .map((symbolRecord: any) => symbolRecord?.symbol)
    .filter((symbol: string) => typeof symbol === "string" && symbol.length > 0);
  if (tradableSymbols.length === 0) {
    return { openInterestAtEnd: 0 };
  }

  const baseCurrencyBySymbol = new Map<string, string>();
  for (const symbolRecord of tradableSymbolRecords) {
    const symbol = symbolRecord?.symbol;
    const baseCurrency = symbolRecord?.baseCurrency;
    if (typeof symbol === "string" && symbol.length > 0 && typeof baseCurrency === "string" && baseCurrency.length > 0) {
      baseCurrencyBySymbol.set(symbol, baseCurrency);
    }
  }

  const query = new URLSearchParams();
  tradableSymbols.forEach((symbol) => query.append("symbols[]", symbol));
  const tickerResponse = await httpGet(`${TICKERS_URL}?${query.toString()}`);
  const tickers = Array.isArray(tickerResponse?.tickers)
    ? tickerResponse.tickers
    : Array.isArray(tickerResponse?.data?.tickers)
      ? tickerResponse.data.tickers
      : [];

  const rateMap = buildSourceCurrencyToRateMap(exchangeInfo?.currencyRates, TARGET_CURRENCY);

  if (rateMap.size === 0) {
    return { openInterestAtEnd: 0 };
  }

  const openInterestAtEnd = tickers.reduce((accumulator: number, ticker: any) => {
    const symbol = typeof ticker?.symbol === "string" ? ticker.symbol : undefined;
    if (!symbol) {
      return accumulator;
    }

    const baseCurrency = baseCurrencyBySymbol.get(symbol);
    if (!baseCurrency) {
      return accumulator;
    }

    const lastOpenInterest = Number(ticker?.lastOpenInterest);
    if (!Number.isFinite(lastOpenInterest)) {
      return accumulator;
    }

    const convertedAmount = convertAmountToTargetCurrency(lastOpenInterest, baseCurrency, rateMap);
    if (convertedAmount === null) {
      return accumulator;
    }

    return accumulator + convertedAmount;
  }, 0);

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  runAtCurrTime: true,
};

export default adapter;