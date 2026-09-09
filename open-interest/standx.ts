import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
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

const fetch = async (_options: FetchOptions) => {
    const symbolsResponse: SymbolInfo[] = await fetchURL(
        `${apiEndpoint}/query_symbol_info`
    );

    const symbols: string[] = symbolsResponse.filter(
        (item) => item.status === "trading" || item.status === "reduce_only"
    ).map((item) => item.symbol);

    const marketInfo: MarketInfo[] = await Promise.all(symbols.map((symbol: string) => limit(() => fetchURL(`${apiEndpoint}/query_symbol_market?symbol=${symbol}`))));

    const { openInterestAtEnd } = marketInfo.reduce((acc: any, curr: any) => {
        acc.openInterestAtEnd += +curr.open_interest_notional;
        return acc;
    }, { openInterestAtEnd: 0 });

    return {
        // open_interest_notional is double-sided (measured: 43 windows at exactly 2x fill size,
        // 12/12 lags, on BNB-USD), so halve it for the one-sided convention
        openInterestAtEnd: openInterestAtEnd / 2,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.STANDX],
    runAtCurrTime: true,
};

export default adapter;
