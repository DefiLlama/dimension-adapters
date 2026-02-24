import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances()

    const feeWallets = options.endTimestamp < 1757030400 ? ['5Lu3fmsYEJs4g6g1pgspjkXWKRMAgwNB5m389bSoNxek'] : ['3TJTfpUCHSfTX1yqk7pcCg2UrkLT9KkeuyVEm2u6p5JA'];

    await getSolanaReceived({
        options,
        balances: dailyFees,
        targets: feeWallets,
    })

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    start: '2025-08-01',
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.ALLIUM],
    methodology: {
        Fees: 'All trading fees paid by users while using the DSX protocol.',
        Revenue: 'Trading fees are collected by the DSX protocol.',
        ProtocolRevenue: 'Trading fees are collected by the DSX protocol.',
    },
}

export default adapter;