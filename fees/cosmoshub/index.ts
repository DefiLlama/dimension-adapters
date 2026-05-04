import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const COSMOS_DECIMALS = 6;

const fetch = async (options: FetchOptions) => {
    const start = new Date(options.fromTimestamp * 1000).toISOString()
    const end = new Date(options.toTimestamp * 1000).toISOString()

    const query = `
    SELECT 
        sum(fee_amount) as tx_fees,
    FROM cosmos.raw.transactions
    where _created_at BETWEEN '${start}' AND '${end}'
  `;

    const res = await queryAllium(query);
    const dailyFees = options.createBalances();

    dailyFees.addCGToken('cosmos', res[0].tx_fees / 10 ** COSMOS_DECIMALS);

    return {
        dailyFees,
        dailyRevenue: 0,
        dailyHoldersRevenue: 0,
    }
}

const methodology = {
    Fees: "Transaction fees paid by users for executing transactions on the Cosmos network",
    Revenue: 'No revenue',
    HoldersRevenue: 'None of the transaction fees are burnt',
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.COSMOS],
    start: '2021-02-18',
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    methodology,
};

export default adapter;
