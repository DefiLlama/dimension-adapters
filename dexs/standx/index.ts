import fetchURL from "../../utils/fetchURL";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const apiEndpoint = "https://perps.standx.com/api";

interface SymbolInfo {
  symbol: string;
  status: string;
}

interface MarketInfo {
  symbol: string;
  volume_quote_24h: number;
  open_interest_notional: string;
}

function parseSymbols(response: SymbolInfo[]): string[] {
  return response
    .filter(
      (item) => item.status === "trading" || item.status === "reduce_only"
    )
    .map((item) => item.symbol);
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
  const symbolsResponse: SymbolInfo[] = await fetchURL(
    `${apiEndpoint}/query_symbol_info`
  );
  const symbols: string[] = parseSymbols(symbolsResponse);

  let totalVolume = 0;
  let totalOpenInterest = 0;

  for (const symbol of symbols) {
    const marketInfo: MarketInfo = await fetchURL(
      `${apiEndpoint}/query_symbol_market?symbol=${symbol}`
    );
    totalVolume += marketInfo.volume_quote_24h || 0;
    totalOpenInterest += parseFloat(marketInfo.open_interest_notional) || 0;
  }

  return {
    dailyVolume: totalVolume,
    openInterestAtEnd: totalOpenInterest,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STANDX]: {
      fetch,
      start: "2025-12-01",
    },
  },
};

export default adapter;
