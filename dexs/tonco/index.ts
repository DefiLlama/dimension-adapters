import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const GRAPHQL_ENDPOINT = 'https://indexer.tonco.io';

const WHITELIST_JETTONS = [
    '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', // USDT
    '0:949c4c66760c002800e2fa3d8a3ca4e1c90a9373b53ae7472033483bf14cd95e', // WTTON
]

const SWAPS_QUERY = (from: number, to: number) => `
    query GetSwaps {
        swaps (where: { time: { gte: "${from}", lte: "${to}" } }) {
            toRefund0
            toRefund1
            amount
            isZeroToOne
            pool {
                fee
                jetton0 {
                    address
                    symbol
                    decimals
                    derivedUsd
                }
                jetton1 {
                    address
                    symbol
                    decimals
                    derivedUsd
                }
            }
        }
    } 
`

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {

    const swaps = await postURL(GRAPHQL_ENDPOINT, {
        query: SWAPS_QUERY(options.fromTimestamp * 1000, options.toTimestamp * 1000)
    })

    let dailyVolume = 0;

    for (const swap of swaps.data.swaps) {

        const fromJetton = swap.isZeroToOne ? swap.pool.jetton0 : swap.pool.jetton1;
        
        if (!WHITELIST_JETTONS.includes(fromJetton.address)) {
            continue;
        }

        if (String(swap.amount) === String(swap.toRefund0) || String(swap.amount) === String(swap.toRefund1)) {
            continue;
        }
        
        const amount = Number(swap.amount) / ( 10 ** (swap.isZeroToOne ? swap.pool.jetton0.decimals : swap.pool.jetton1.decimals) );
        const amountUsd = amount * fromJetton.derivedUsd;

        dailyVolume += amountUsd

    }
    
    return {
        dailyVolume,
        timestamp: options.startTimestamp
    }

};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            start: '2024-11-25',
            fetch
        },
    }
};

export default adapter;