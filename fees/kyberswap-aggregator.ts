import { CHAIN } from "../helpers/chains"
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";

const chains = [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.ERA, CHAIN.POLYGON, CHAIN.BASE, CHAIN.BSC, CHAIN.LINEA, CHAIN.SCROLL, CHAIN.AVAX, CHAIN.FANTOM,
// disabled chains: CHAIN.MANTLE, CHAIN.BLAST, CHAIN.CRONOS, CHAIN.POLYGON_ZKEVM,
]

const feeCollector = "0x4f82e73edb06d29ff62c91ec8f5ff06571bdeb29"
async function fetch(options:FetchOptions){
    // MISSING INTERNAL ETH TRANSFERS!
    const dailyFees = await addTokensReceived({target: feeCollector, options})
    return {dailyFees, dailyRevenue: dailyFees }
}

export default {
    adapter: 
        chains.reduce((acc, curr)=>({
            ...acc,
            [curr]:{
                fetch: fetch,
                start: '2023-05-12'
            }
        }), {})
    ,
    version: 2
} as SimpleAdapter;
