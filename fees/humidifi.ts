import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

interface tokenFlow {
    token: string,
    amount_bought: number,
    amount_sold: number
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyRevenue = options.createBalances();

    const query = `
        SELECT
            token,
            COALESCE(SUM(amount_sold), 0) AS amount_sold,
            COALESCE(SUM(amount_bought), 0) AS amount_bought
        FROM (
            SELECT
                token_sold_mint_address AS token,
                token_sold_amount_raw AS amount_sold,
                0 AS amount_bought
            FROM dex_solana.trades
            WHERE project = 'humidifi'
            AND TIME_RANGE

            UNION ALL

            SELECT
                token_bought_mint_address AS token,
                0 AS amount_sold,
                token_bought_amount_raw AS amount_bought
            FROM dex_solana.trades
            WHERE project = 'humidifi'
            AND TIME_RANGE
        ) t
        GROUP BY token
    `;

    const data = await queryDuneSql(options, query);
    data.forEach((tokenFlow: tokenFlow) => dailyRevenue.add(tokenFlow.token, tokenFlow.amount_sold - tokenFlow.amount_bought))

    return {
        dailyFees: dailyRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-05-26',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    allowNegativeValue: true,
    methodology: {
        Fees: "Estimated from HumidiFi's net trading flow as a market maker. Traders swap against HumidiFi's proprietary AMM (single LP), so the LP's daily inventory change valued at current prices proxies for the implicit fees charged by the protocol.",
        Revenue: "HumidiFi's estimated daily trading PnL based on net inventory change. May diverge from actual net revenue if HumidiFi hedges inventory off-chain (CEX hedges, funding costs, etc.).",
        ProtocolRevenue: "All estimated trading revenue accrues to HumidiFi as the sole LP in its proprietary AMM.",
    }
};

export default adapter;
