import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const query = `
        WITH l2_fees_cte AS (
            SELECT
                SUM(tx_fee_raw) AS daily_fees
            FROM gas.fees
            WHERE blockchain = 'polygon'
                AND block_time >= from_unixtime(${options.startTimestamp})
                AND block_time <= from_unixtime(${options.endTimestamp})
        ),
        l1_batch_costs_cte AS (
            SELECT 
                SUM(t.gas_used*t.gas_price) AS daily_cost
            FROM ethereum.transactions AS t
            WHERE t.to = 0x86e4dc95c7fbdbf52e33d563bbdb00823894c287
                AND cast(t.data as varchar) LIKE '0x4e43e495%'
                AND block_time >= from_unixtime(${options.startTimestamp})
                AND block_time <= from_unixtime(${options.endTimestamp})
        )
        SELECT 
            l2.daily_fees,
            l1.daily_cost
        FROM l2_fees_cte as l2
        CROSS JOIN l1_batch_costs_cte as l1 
    `
    const res = await queryDuneSql(options, query);
    dailyFees.addGasToken(res[0].daily_fees);
    const dailyRevenue = dailyFees.clone();
    const dc = options.createBalances();
    dc.addCGToken('ethereum', Number(res[0].daily_cost) / 1e18);
    dailyRevenue.subtract(dc)

    return {
        dailyFees,
        dailyRevenue
    }
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.POLYGON]: {
            fetch,
            start: '2020-05-30',
        },
    },
    protocolType: ProtocolType.CHAIN,
    isExpensiveAdapter: true,
    allowNegativeValue: true, // L1 Costs
    methodology: {
        Fees: 'Total transaction fees paid by users',
        Revenue: 'Total revenue on Polygon, calculated by subtracting the L1 Batch Costs from the total gas fees'
    }
}

export default adapter;
