import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";


const prefetch = async (options: FetchOptions) => {
    const sql_query = getSqlFromFile('helpers/queries/virtual-protocol.sql', {startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp})
    return await queryDuneSql(options, sql_query);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const results = options.preFetchedResults || [];
    const chainData = results.find((item: any) => item.chain === options.chain);
    if (chainData) {
        dailyFees.addUSDValue(chainData.fees_usd);
    }

    return {
        timestamp: options.startOfDay,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const meta = {
  methodology: {
    Fees: 'Revenue from Virtual Protocol across 4 main streams: 1) Base Virtual-fun (legacy buy/sell transactions), 2) Base Virtual-app (legacy non-trading), 3) Base CBBTC-prototype (direct transfers to prototype wallet), 4) Base CBBTC-sentient (outflows from tax manager representing agent treasury distributions). Also includes Ethereum Virtual transfers and Solana prototype fees + 1% of agent trading volume. Individual ecosystem and treasury transfers are replaced by the tax manager outflow method to avoid double counting.',
    Revenue: 'Fees collected by the Protocol.',
    ProtocolRevenue: 'Revenue from all sources to the Protocol.',
  }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            start: "2024-10-15",
            meta,
        },
        [CHAIN.ETHEREUM]: {
            fetch,
            start: "2025-06-11", 
            meta,
        },
        [CHAIN.SOLANA]: {
            fetch,
            start: "2025-02-11",
            meta,
        },
    },
    prefetch,
    isExpensiveAdapter: true,
}

export default adapter;
