import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const duneQuery = `
        SELECT
            volume,
            fee
        FROM
            dune.txflow_mainnet.platform_daily_trades
        WHERE
            date = DATE '${options.dateString}'
    `;

    const result = await queryDuneSql(options, duneQuery);

    if (!result || result.length === 0) {
        throw new Error(`No data found for date ${options.dateString}`);
    }

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    dailyVolume.addUSDValue(result[0].volume);
    dailyFees.addUSDValue(result[0].fee / 4, "Maker Fees");
    dailyFees.addUSDValue(result[0].fee * 3 / 4, "Taker Fees");

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Volume: "Total daily trading volume from all perpetual markets on TxFlow.",
    Fees: 'Fees collected from user trading fees and funding fees on TxFlow perpetual markets.',
    UserFees: 'Fees collected from user trading fees on TxFlow perpetual markets.',
    Revenue: "All the fees are revenue for the protocol.",
    ProtocolRevenue: "All the revenue goes to the protocol.",
}

const breakdownMethodology = {
    Fees: {
        "Maker Fees": "0.015% of the trade volume is collected as maker fees.",
        "Taker Fees": "0.045% of the trade volume is collected as taker fees.",
    },
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.TXFLOW],
    start: '2026-03-26',
    methodology,
    breakdownMethodology,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
}

export default adapter;