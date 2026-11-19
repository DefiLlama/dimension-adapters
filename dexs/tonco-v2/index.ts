import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const GRAPHQL_ENDPOINT = 'https://indexer.tonco.io';

// TONCO v2.0 pools are indexed with version "v1.6"; the v1 adapter (dexs/tonco)
// skips them so the two adapters never double count.
const V2_POOL_VERSION = 'v1.6';

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

// v2.0 launched after the 2025-07-10 protocol fee change, so the split is flat
const PROTOCOL_FEE_PERC = 0.2;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {

    const swaps = await postURL(GRAPHQL_ENDPOINT, {
        query: SWAPS_QUERY(options.fromTimestamp * 1000, options.toTimestamp * 1000)
    })

    let dailyVolume = 0;
    let dailyFees = 0;

    for (const swap of swaps.data.swaps) {

        if (swap.pool.version !== V2_POOL_VERSION) {
            continue;
        }

        if (!WHITELIST_JETTONS.includes(swap.pool.jetton0.address) && !WHITELIST_JETTONS.includes(swap.pool.jetton1.address)) {
            continue;
        }

        if (String(swap.amount) === String(swap.toRefund0) || String(swap.amount) === String(swap.toRefund1)) {
            continue;
        }

        const fromJetton = swap.isZeroToOne ? swap.pool.jetton0 : swap.pool.jetton1;
        const amount = Number(swap.amount) / (10 ** fromJetton.decimals);
        const amountUsd = amount * fromJetton.derivedUsd;

        dailyVolume += amountUsd
        dailyFees += amountUsd * swap.pool.fee / 10_000

    }

    const dailyRevenue = dailyFees * PROTOCOL_FEE_PERC;

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
        Revenue: 'The protocol receives 20% of the fees paid by users.',
        ProtocolRevenue: 'The protocol receives 20% of the fees paid by users.',
        SupplySideRevenue: '80% of user jetton fees are distributed among LPs, based on the amount of user liquidity utilized in a particular swap.'
    },
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.TON]: {
            start: '2026-06-01',
            fetch
        },
    }
};

export default adapter;
