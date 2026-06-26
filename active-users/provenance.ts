import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
    const start = new Date(options.fromTimestamp * 1000).toISOString()
    const end = new Date(options.toTimestamp * 1000).toISOString()

    const alliumQuery = `
    SELECT 
        COALESCE(count(distinct split_part(tx_acc_seq, '/', 1)), 0) as user_count,
        COALESCE(count(*), 0) as total_transaction_count
    FROM provenance.raw.transactions
    where block_timestamp BETWEEN '${start}' AND '${end}'
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
    chains: [CHAIN.PROVENANCE],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    start: "2025-07-11",
};

export default adapter;
