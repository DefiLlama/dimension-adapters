import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

interface Token {
    token0Address?: string;
    token1Address?: string;
    token0Name?: string;
    token1Name?: string;
    token0Symbol?: string;
    token1Symbol?: string;
    token0Decimal?: number;
    token1Decimal?: number;
}

interface PairData {
    pairAddress: string;
    token0: Token;
    token1: Token;
    version: string;
    fee: number;
    h24: string | null;
}

interface ApiResponse {
    success: boolean;
    data: {
        pageCount: number;
        pairs: PairData[];
    };
}

const fetchData = async (options: FetchOptions) => {
    const url = (page: number) =>  `https://api.hyperswap.exchange/api/pairs?page=${page}&maxPerPage=50`
    let page = 0;
    const data: PairData[] = []
    
    while(true) {
        const response = await httpGet(url(page), { 
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Cache-Control": "no-cache",
                "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"macOS"',
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Origin": "https://hyperswap.exchange",
                "Referer": "https://hyperswap.exchange/"
            }
        });
        
        const res = response.data as ApiResponse;
        page++;

        if (!res.success || res.data.pageCount < page) break;

        data.push(...res.data.pairs);   
    }

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    
    data
        .filter((pair) => pair.version === "v3")
        .forEach((pair) => {
            if (pair.h24) {
                const volume = Number(pair.h24);
                dailyVolume.addUSDValue(volume);
                dailyFees.addUSDValue((volume * Number(pair.fee)) / 1000000); // (fee/10000)/100 simplified
            }
        });

    return {
        dailyVolume,
        dailyFees
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        hyperliquid: {
            fetch: fetchData,
            runAtCurrTime: true,
        }
    }
}

export default adapter