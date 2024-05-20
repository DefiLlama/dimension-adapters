import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { Address } from "@defillama/sdk/build/types";
import { Adapter, SimpleAdapter } from "../../adapters/types";

const expansionABI = {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
}

const getExpansionAddress = (chain: Chain): Address => {
    if (chain == CHAIN.MANTLE) return '0x2139788f64bA30Ee73b6b2549e62E42F3c6Da1C5'
    if (chain == CHAIN.BLAST) return '0xf06DB250003C9aE2b7a6D21b7b5b468C8325D690'
    if (chain == CHAIN.BASE) return '0x2139788f64bA30Ee73b6b2549e62E42F3c6Da1C5'

    throw 'NOT SUPPORTED CHAIN'
}


const getTVL = async (chain: Chain) => {
    const tvl = (await sdk.api.abi.call(
        {
            target: getExpansionAddress(chain),
            chain: chain,
            abi: expansionABI,
        }
    )).output

    return {
        tvl: tvl,
        timestamp: 0
    }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.MANTLE]: {
            fetch: async () => getTVL(CHAIN.MANTLE),
            start: async () => 0
        },
        [CHAIN.BLAST]: {
            fetch: async () => getTVL(CHAIN.BLAST),
            start: async () => 0
        },
        [CHAIN.BASE]: {
            fetch: async () => getTVL(CHAIN.BASE),
            start: async () => 0
        },
    }
}

export default adapter;