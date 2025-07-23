import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";


const prefetch = async (options: FetchOptions) => {
    const sql_query = getSqlFromFile('helpers/queries/virtual-protocol.sql', {startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp})
    return await queryDuneSql(options, sql_query);
}

const fetchFees = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const results = options.preFetchedResults || [];
    const chainData = results.find((item: any) => item.chain === options.chain);
    dailyFees.addUSDValue(chainData.fees_usd);

    return {
        timestamp: options.startOfDay,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const meta = {
  methodology: {
    Fees: 'All fees paid by users from launching adn trading tokens.',
    Revenue: 'Fees are collected by Virtual Protocol.',
    ProtocolRevenue: 'Fees are collected by Virtual Protocol.',
  }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetchFees,
            start: "2024-10-16",
            meta,
        },
        [CHAIN.SOLANA]: {
            fetch: fetchFees,
            start: "2024-10-16",
            meta,
        },
    },
    prefetch,
    isExpensiveAdapter: true,
}

export default adapter;
