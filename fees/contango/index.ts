import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";


const fetch = async (options: FetchOptions) => {
    const dailyFees = await addTokensReceived({ 
        options,
        target: '0xFee97c6f9Bce786A08b1252eAc9223057508c760'
    })
    return {
        dailyFees
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.BASE]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.SCROLL]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.XDAI]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.AVAX]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.LINEA]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.POLYGON]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.BSC]: {
            fetch: fetch,
            start: '2024-11-05'
        },
    }
}

export default adapter;
