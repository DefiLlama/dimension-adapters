import {FetchOptions, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {getSolanaReceived} from "../../helpers/token";

const feeWallets = [
    '5Lu3fmsYEJs4g6g1pgspjkXWKRMAgwNB5m389bSoNxek',
]

const fetch = async(_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances()
    await getSolanaReceived({
        options,
        balances: dailyFees,
        targets: feeWallets,
    })

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 1,
    methodology: {
        Fees: 'All trading fees paid by users while using the DSX protocol.',
        Revenue: 'Trading fees are collected by the DSX protocol.',
        ProtocolRevenue: 'Trading fees are collected by the DSX protocol.',
    },
    fetch,
    start: '2025-08-01',
    chains: [CHAIN.SOLANA],
}

export default adapter;