import { FetchOptions, SimpleAdapter, FetchResultV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

interface HyperswapPair {
    version: string;
    h24: string;
    fee: string;
}

interface HyperswapResponse {
    pairs: HyperswapPair[];
    pageCount: number;
}

const fetchData = async (options: FetchOptions): Promise<FetchResultV2> => {
    const url = (page: number) =>  `https://api.hyperswap.exchange/api/pairs?page=${page}&maxPerPage=50`
    let page = 0;
    const data: HyperswapPair[] = []
    while(true) {
        const res = (await httpGet(url(page), {
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
        })) as { data: HyperswapResponse };
        page++

        if (res.data.pageCount < page) break

        data.push(...res.data.pairs)   
    }

    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    data.filter((e) => e.version === "v2").forEach((pair) => {
        if (pair.h24) {
            dailyVolume.addUSDValue(Number(pair.h24))
            dailyFees.addUSDValue(Number(pair.h24) * (Number(pair.fee)/10000)/100)
        }
    })

    return {
        dailyVolume,
        dailyFees,
        timestamp: options.startOfDay,
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