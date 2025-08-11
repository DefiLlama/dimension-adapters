import {FetchOptions, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {queryDuneSql} from "../../helpers/dune";

const fetch = async(_a: any, _b: any, options: FetchOptions) => {
    console.log('Fetching DSX daily fees data...', new Date(options.startTimestamp * 1000).toDateString(), '-', new Date(options.endTimestamp * 1000).toDateString());

    const data = await queryDuneSql(options, `
        WITH transfers AS (
            SELECT block_time, to_owner, amount_usd FROM tokens_solana.transfers
            WHERE to_owner = '5Lu3fmsYEJs4g6g1pgspjkXWKRMAgwNB5m389bSoNxek'
            AND token_version = 'native'
            AND action = 'transfer'
            AND TIME_RANGE
        )
        SELECT SUM(amount_usd) as dailyFees FROM transfers;
    `);

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(data[0].dailyFees ?? 0);

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-08-01',
            meta: {
                methodology: {
                    Fees: 'All trading fees paid by users while using the DSX protocol.',
                    Revenue: 'Trading fees are collected by the DSX protocol.',
                    ProtocolRevenue: 'Trading fees are collected by the DSX protocol.',
                }
            }
        }
    },
    isExpensiveAdapter: true,
}

export default adapter;