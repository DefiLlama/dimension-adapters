import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

interface HyperswapPair {
    version: string;
    h24: string;
    fee: string;
}

interface HyperswapResponse {
    pairs: HyperswapPair[];
    pageCount: number;
}

const encodeToken = (input: string) => {
    const keystreamHexAscii = 
      "cdc49b16573644bbe4cb47c809a6d387" +
      "873331e665d622b1337a4e19593c5a18" +
      "cdc49b16573";
    const encoder = new TextEncoder();
    const pt = encoder.encode(input);
    const ks = encoder.encode(keystreamHexAscii);
    const ct = new Uint8Array(pt.length);
    for (let i = 0; i < pt.length; i++) {
      ct[i] = pt[i] ^ ks[i];
    }
    let bin = "";
    for (let b of ct) {
      bin += String.fromCharCode(b);
    }
    return btoa(bin);
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const clientToken = await httpGet('https://proxy.hyperswapx.workers.dev/get-token')
    const url = (page: number) =>  `https://proxy.hyperswapx.workers.dev/api/pairs?minTvl=10000&maxPerPage=50&page=${page}`
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
                "x-client-token": `${encodeToken(clientToken)}`,
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
    data.filter((e) => e.version === "v3").forEach((pair) => {
        if (pair.h24) {
            dailyVolume.addUSDValue(Number(pair.h24))
            dailyFees.addUSDValue(Number(pair.h24) * (Number(pair.fee)/10000)/100)
        }
    })

    return {
        dailyVolume,
        dailyFees,
    }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch: getUniV3LogAdapter({
                factory: '0xB1c0fa0B789320044A6F623cFe5eBda9562602E3',

                // https://docs.hyperswap.exchange/hyperswap/token-design/or-protocol-earnings
                userFeesRatio: 1,
                revenueRatio: 0.4, // 40% swap fees
                protocolRevenueRatio: 0.08, // 8% swap fees
                holdersRevenueRatio: 0.32, // 32% swap fees
            }),
            meta: {
                methodology: {
                    Fees: "Total swap fees paided by users.",
                    Revenue: "Revenue collected from 40% swap fees.",
                    ProtocolRevenue: "Revenue for HyperSwap from 8% swap fees.",
                    SupplySideRevenue: "Amount of 60% swap fees distributed to LPs.",
                    HoldersRevenue: "Amount of 32% swap fees distributed to Swap stakers and buy-back and burn.",
                    UserFees: "Total swap fees paided by users."
                }
            }
        }
    }
}

// const adapter: SimpleAdapter = {
//     version: 2,
//     adapter: {
//         [CHAIN.HYPERLIQUID]: {
//             fetch,
//             runAtCurrTime: true,
//         }
//     }
// }

// export default adapter