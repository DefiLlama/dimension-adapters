import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { FetchOptions } from "../adapters/types";

interface IData {
    quote_mint: string;
    total_volume: number;
    total_trading_fees: number;
    total_protocol_fees: number;
    total_referral_fees: number;
}



const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = getSqlFromFile("helpers/queries/dbc-config.sql", {
        config: "u88znXHbqsTsXSBwHnmb8v8k8UypkVJGavQo3JEsend",
        start: options.startTimestamp,
        end: options.endTimestamp
    });

    const data: IData[] = await queryDuneSql(options, query)
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    data.forEach(row => {
        const totalFees = Number(row.total_trading_fees);
        dailyFees.add(row.quote_mint, Number(totalFees));
        dailyProtocolRevenue.add(row.quote_mint, Number(row.total_trading_fees));
    });

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
    };
};


const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-06-18',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
        Fees: "Trading fees paid by users.",
        Revenue: "Fees collected by SendShot protocol.",
        ProtocolRevenue: "Fees collected by SendShot protocol."
    }
}

export default adapter