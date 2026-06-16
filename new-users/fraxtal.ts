import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
    const start = new Date(options.fromTimestamp * 1000).toISOString()
    const end = new Date(options.toTimestamp * 1000).toISOString()

    const alliumQuery = `
    SELECT
        COALESCE(count(distinct from_address), 0) as new_users
    FROM fraxtal.raw.transactions
    where nonce = 0
      and block_timestamp BETWEEN '${start}' AND '${end}'
  `;

    const alliumResult = await queryAllium(alliumQuery);

    return {
        dailyNewUsers: alliumResult[0].new_users,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.FRAXTAL],
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    start: "2024-02-01",
};

export default adapter;
