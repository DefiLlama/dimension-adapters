import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
// import { getUniV2LogAdapter } from "../../helpers/uniswap";

interface HyperswapPair {
    version: string;
    h24: string;
    fee: string;
}

interface HyperswapResponse {
    pairs: HyperswapPair[];
    pageCount: number;
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const url = (page: number) =>  `https://api-partner.hyperswap.exchange/api/pairs?minTvl=50000&maxPerPage=50&page=${page}`
    const headers = { 'x-internal-access': 1 }
    let page = 0;
    const data: HyperswapPair[] = []
    while(true) {
        const res = (await httpGet(url(page), { headers })) as { data: HyperswapResponse };
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

    const dailyRevenue = dailyFees.clone(0.4)
    const dailyProtocolRevenue = dailyFees.clone(0.08)
    const dailySupplySideRevenue = dailyFees.clone(0.6)
    const dailyHoldersRevenue = dailyFees.clone(0.32)

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
        dailyUserFees: dailyFees,
    }
}

const methodology = {
    Fees: "Total swap fees paided by users.",
    Revenue: "Revenue collected from 40% swap fees.",
    ProtocolRevenue: "Revenue for HyperSwap from 8% swap fees.",
    SupplySideRevenue: "Amount of 60% swap fees distributed to LPs.",
    HoldersRevenue: "Amount of 32% swap fees distributed to Swap stakers and buy-back and burn.",
    UserFees: "Total swap fees paided by users."
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.HYPERLIQUID]: {
            fetch,
            runAtCurrTime: true,
            start: '2025-02-18',
            meta: { methodology }
        }
    }
}

export default adapter

// export default {
//     version: 2,
//     adapter: {
//         [CHAIN.HYPERLIQUID]: {
//             fetch: getUniV2LogAdapter({
//                 factory: '0x724412C00059bf7d6ee7d4a1d0D5cd4de3ea1C48',

//                 // https://docs.hyperswap.exchange/hyperswap/token-design/or-protocol-earnings
//                 userFeesRatio: 1,
//                 revenueRatio: 0.4, // 40% swap fees
//                 protocolRevenueRatio: 0.08, // 8% swap fees
//                 holdersRevenueRatio: 0.32, // 32% swap fees
//             }),
//             meta: {
//                 methodology: {
//                     Fees: "Total swap fees paided by users.",
//                     Revenue: "Revenue collected from 40% swap fees.",
//                     ProtocolRevenue: "Revenue for HyperSwap from 8% swap fees.",
//                     SupplySideRevenue: "Amount of 60% swap fees distributed to LPs.",
//                     HoldersRevenue: "Amount of 32% swap fees distributed to Swap stakers and buy-back and burn.",
//                     UserFees: "Total swap fees paided by users."
//                 }
//             }
//         }
//     }
// }