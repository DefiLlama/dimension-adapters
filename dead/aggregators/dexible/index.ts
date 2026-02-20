import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chains = [
    CHAIN.ETHEREUM,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BSC,
    CHAIN.FANTOM,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON
];


const getFetch = (chain: string): Fetch => async (timestamp: number) => ({})

const adapter: SimpleAdapter = {
    deadFrom: '2023-02-21',  // https://x.com/DexibleApp/status/1628117375278088192
    adapter: {
        ...chains.reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: getFetch(chain),
                }
            }
        }, {}) as SimpleAdapter['adapter']
    }
}

export default adapter;