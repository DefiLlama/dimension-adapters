import { DISABLED_ADAPTER_KEY, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

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
        [DISABLED_ADAPTER_KEY]: disabledAdapter, // site has been sunset and discord is dead 
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