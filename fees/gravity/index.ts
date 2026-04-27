import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const GRAVITY_DECIMALS = 18;

const fetch = async (options: FetchOptions) => {
    const query = `
      SELECT 
        SUM(receipt_gas_used * receipt_effective_gas_price) AS l2_fees_wei,
      FROM gravity.raw.transactions
      WHERE block_timestamp BETWEEN '${options.startTimestamp}' AND '${options.endTimestamp}'
    `;

    const res = await queryAllium(query);
    const dailyFees = options.createBalances();

    dailyFees.addCGToken('g-token', res[0].l2_fees_wei / 10 ** GRAVITY_DECIMALS);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyHoldersRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Transaction fees paid by users for executing transactions on the Gravity network",
    Revenue: "All the transaction fees paid are burnt",
    HoldersRevenue: "All the transaction fees paid are burnt",
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.GRAVITY],
    start: '2024-05-18',
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    methodology,
};

export default adapter;
