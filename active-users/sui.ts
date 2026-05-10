import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const start = new Date(options.fromTimestamp * 1000).toISOString()
    const end = new Date(options.toTimestamp * 1000).toISOString()

    const alliumQuery = `
    SELECT 
        COALESCE(count(distinct sender), 0) as user_count,
        COALESCE(sum(transactions_count), 0) as total_transaction_count
    FROM sui.raw.transaction_blocks
    where checkpoint_timestamp BETWEEN '${start}' AND '${end}'
  `;

    const alliumResult = await queryAllium(alliumQuery);

    return {
        dailyActiveUsers: alliumResult[0].user_count,
        dailyTransactionsCount: alliumResult[0].total_transaction_count,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SUI],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    start: "2023-04-12",
};

export default adapter;
