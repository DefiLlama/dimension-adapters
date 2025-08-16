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
    let supplySideRevenuePerc = 0.9;
    if (options.startTimestamp > 1752105600) { // Protocol Fee changed on 2025-07-10 from 10% of lp fees to 20% of lp fees
        protocolFeePerc = 0.2;
        supplySideRevenuePerc = 0.8;
    }
    const swaps = await postURL(GRAPHQL_ENDPOINT, {
        query: SWAPS_QUERY(options.fromTimestamp * 1000, options.toTimestamp * 1000)
    })

    let totalFees = 0;
    let totalProtocolFees = 0;

    for (const swap of swaps.data.swaps) {

        const fromJetton = swap.isZeroToOne ? swap.pool.jetton0 : swap.pool.jetton1;

        if (swap.pool.version === 'v1.5') {
            continue;
        }

        if (!WHITELIST_JETTONS.includes(fromJetton.address)) {
            continue;
        }

        if (String(swap.amount) === String(swap.toRefund0) || String(swap.amount) === String(swap.toRefund1)) {
            continue;
        }

        const amount = Number(swap.amount) / (10 ** (swap.isZeroToOne ? swap.pool.jetton0.decimals : swap.pool.jetton1.decimals));
        const amountUsd = amount * fromJetton.derivedUsd;

        const fee = swap.pool.fee / 10_000;
        const lpFee = amountUsd * fee;
        const protocolFee = lpFee * protocolFeePerc;

        totalFees += lpFee
        totalProtocolFees += protocolFee

    }

    return {
        dailyUserFees: totalFees,
        dailyFees: totalFees,
        dailySupplySideRevenue: totalFees * supplySideRevenuePerc,
        dailyRevenue: totalProtocolFees,
        dailyProtocolRevenue: totalProtocolFees
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
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2024-11-25',
        },
    }
};

export default adapter;