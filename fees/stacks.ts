import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const alliumQuery = `
      SELECT 
        COALESCE(SUM(fee_rate), 0) AS total_fees_microstx
      FROM stacks.raw.transactions
      WHERE burn_block_time >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND burn_block_time < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `;

    const alliumResult = await queryAllium(alliumQuery);

    dailyFees.addCGToken('blockstack', alliumResult[0].total_fees_microstx / 1e6);

    return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
};

const methodology = {
    Fees: "Transaction fees paid by users on Stacks, computed by querying the Allium database.",
    Revenue: "None. Stacks transaction fees are not burned",
    SupplySideRevenue: "Stacks transaction fees are paid to miners/block producers.",
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.STACKS],
    start: "2021-01-14",
    isExpensiveAdapter: true,
    protocolType: ProtocolType.CHAIN,
    dependencies: [Dependencies.ALLIUM],
    methodology,
};

export default adapter;
