import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    quote_mint: string;
    protocol_fee: string;
}

const fetch = async (options: FetchOptions) => {
    // fees are charged in the pool's quote token, which is no longer always SOL (USD1, USDC, BONK, xStocks...)
    const data: IData[] = await queryDuneSql(options, `
        WITH pools AS (
            SELECT account_pool_state AS pool_state, account_quote_mint AS quote_mint
            FROM raydium_solana.raydium_launchpad_call_initialize
            UNION ALL
            SELECT account_pool_state, account_quote_mint
            FROM raydium_solana.raydium_launchpad_call_initialize_v2
            UNION ALL
            SELECT account_pool_state, account_quote_mint
            FROM raydium_solana.raydium_launchpad_call_initialize_with_token_2022
        )
        SELECT
            p.quote_mint AS quote_mint,
            CAST(SUM(t.protocol_fee) AS VARCHAR) AS protocol_fee
        FROM
            raydium_solana.raydium_launchpad_evt_tradeevent t
            JOIN pools p ON p.pool_state = t.pool_state
        WHERE
            t.evt_block_time >= from_unixtime(${options.startTimestamp})
            AND t.evt_block_time < from_unixtime(${options.endTimestamp})
        GROUP BY 1
    `)
    const dailyFees = options.createBalances()
    data.forEach(({ quote_mint, protocol_fee }) => dailyFees.add(quote_mint, protocol_fee))
    const dailyHoldersRevenue = dailyFees.clone(0.25) // 25% of is burned
    const dailyProtocolRevenue = dailyFees.clone(0.75) // 75% of fees go to the protocol

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    }
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: '2025-04-15',
    version: 1,
    isExpensiveAdapter: true,
    methodology: {
        Fees: 'Protocol fee taken on every trade, denominated in each pool\'s quote token.',
        Revenue: '0.25% burned + 0.75% to protocol of 1% platform fees',
        ProtocolRevenue: '0.75% of platform fees go to the protocol.',
        HoldersRevenue: '0.25% of platform fees are burned.',
    }
}

export default adapter
