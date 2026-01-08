import fetchURL from "../../utils/fetchURL";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import pLimit from "p-limit";

const apiEndpoint = "https://perps.standx.com/api";
const limit = pLimit(5);

interface SymbolInfo {
  symbol: string;
  status: string;
}

interface MarketInfo {
  symbol: string;
  volume_quote_24h: number;
  open_interest_notional: string;
}

const fetch = async (_timestamp: number): Promise<FetchResultVolume> => {
  const symbolsResponse: SymbolInfo[] = await fetchURL(
    `${apiEndpoint}/query_symbol_info`
  );

  const symbols: string[] = symbolsResponse.filter(
    (item) => item.status === "trading" || item.status === "reduce_only"
  ).map((item) => item.symbol);

  const marketInfo: MarketInfo[] = await Promise.all(symbols.map((symbol: string) => limit(() => fetchURL(`${apiEndpoint}/query_symbol_market?symbol=${symbol}`))));

  const { dailyVolume, openInterestAtEnd } = marketInfo.reduce((acc: any, curr: any) => {
    acc.dailyVolume += curr.volume_quote_24h;
    acc.openInterestAtEnd += curr.open_interest_notional;
    return acc;
  }, { dailyVolume: 0, openInterestAtEnd: 0 });

  return {
    dailyVolume,
    openInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STANDX],
  runAtCurrTime: true
};

export default adapter;
