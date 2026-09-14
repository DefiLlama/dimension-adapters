import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const GRAPHQL_ENDPOINT = 'https://indexer.tonco.io';

// Numeraires with a reliable indexer USD price; a swap is counted (in either
// direction) when one side of its pool is one of these.
const WHITELIST_JETTONS = [
    '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe', // USDT
    '0:949c4c66760c002800e2fa3d8a3ca4e1c90a9373b53ae7472033483bf14cd95e', // WTTON
    '0:0000000000000000000000000000000000000000000000000000000000000000', // TON
]

const SWAPS_QUERY = (from: number, to: number) => `
    query GetSwaps {
        swaps (where: { time: { gte: "${from}", lte: "${to}" } }) {
            toRefund0
            toRefund1
            amount
            isZeroToOne
            pool {
                version
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

    let protocolFeePerc = 0.1;
    if (options.startTimestamp > 1752105600) { // Protocol Fee changed on 2025-07-10 from 10% of lp fees to 20% of lp fees
        protocolFeePerc = 0.2;
    }

    const swaps = await postURL(GRAPHQL_ENDPOINT, {
        query: SWAPS_QUERY(options.fromTimestamp * 1000, options.toTimestamp * 1000)
    })

    let dailyVolume = 0;
    let dailyFees = 0;

    for (const swap of swaps.data.swaps) {

        const fromJetton = swap.isZeroToOne ? swap.pool.jetton0 : swap.pool.jetton1;

        // v1.6 pools are TONCO v2.0 - counted by the tonco-v2 adapter
        if (swap.pool.version === 'v1.6') {
            continue;
        }

        if (!WHITELIST_JETTONS.includes(swap.pool.jetton0.address) && !WHITELIST_JETTONS.includes(swap.pool.jetton1.address)) {
            continue;
        }

        if (String(swap.amount) === String(swap.toRefund0) || String(swap.amount) === String(swap.toRefund1)) {
            continue;
        }

        const amount = Number(swap.amount) / ( 10 ** (swap.isZeroToOne ? swap.pool.jetton0.decimals : swap.pool.jetton1.decimals) );
        const amountUsd = amount * fromJetton.derivedUsd;

        dailyVolume += amountUsd

        // v1.5 pool volume is counted but its fees are not (kept from the old fees/tonco adapter)
        if (swap.pool.version !== 'v1.5') {
            dailyFees += amountUsd * swap.pool.fee / 10_000
        }

    }

    const dailyRevenue = dailyFees * protocolFeePerc;

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailySupplySideRevenue: dailyFees - dailyRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }

};

const adapter: SimpleAdapter = {
    methodology: {
        Fees: 'Users pay fees on each swap.',
        UserFees: 'Users pay fees on each swap.',
        Revenue: 'The protocol previously received 10% but currently receives 20% of the fees paid by users.',
        ProtocolRevenue: 'The protocol previously received 10% but currently receives 20% of the fees paid by users.',
        SupplySideRevenue: '(prev 90%) 80% of user jetton fees are distributed among LPs, based on the amount of user liquidity utilized in a particular swap.'
    },
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.TON]: {
            start: '2024-11-25',
            fetch
        },
    }
};

export default adapter;
