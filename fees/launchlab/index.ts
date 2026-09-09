import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    quote_mint: string;
    protocol_fee: string;
    platform_fee: string;
    creator_fee: string;
}

// every trade deducts protocol + platform + creator fee from the input amount (1.3% in total on
// the default config), so the three are additive and only the protocol cut belongs to Raydium
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
            CAST(SUM(t.protocol_fee) AS VARCHAR) AS protocol_fee,
            CAST(SUM(t.platform_fee) AS VARCHAR) AS platform_fee,
            CAST(SUM(t.creator_fee) AS VARCHAR) AS creator_fee
        FROM
            raydium_solana.raydium_launchpad_evt_tradeevent t
            JOIN pools p ON p.pool_state = t.pool_state
        WHERE
            t.evt_block_time >= from_unixtime(${options.startTimestamp})
            AND t.evt_block_time < from_unixtime(${options.endTimestamp})
        GROUP BY 1
    `)
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    data.forEach(({ quote_mint, protocol_fee, platform_fee, creator_fee }) => {
        dailyFees.add(quote_mint, protocol_fee, 'Protocol Fee')
        dailyFees.add(quote_mint, platform_fee, 'Launch Platform Fee')
        dailyFees.add(quote_mint, creator_fee, 'Token Creator Fee')
        dailyRevenue.add(quote_mint, protocol_fee, 'Protocol Fee')
        dailySupplySideRevenue.add(quote_mint, platform_fee, 'Launch Platform Fee')
        dailySupplySideRevenue.add(quote_mint, creator_fee, 'Token Creator Fee')
    })
    const dailyHoldersRevenue = dailyRevenue.clone(0.25) // 25% of the protocol fee is burned
    const dailyProtocolRevenue = dailyRevenue.clone(0.75) // 75% goes to the protocol

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
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
        Fees: 'All fees deducted from trades on the bonding curves: Raydium\'s protocol fee, the launch platform\'s fee and the token creator\'s fee, denominated in each pool\'s quote token.',
        Revenue: 'Raydium\'s protocol fee only. Platform and creator fees are passed on to the third parties that launched the token.',
        ProtocolRevenue: '75% of the protocol fee.',
        HoldersRevenue: '25% of the protocol fee is used to buy back and burn RAY.',
        SupplySideRevenue: 'Fees paid out to the launch platform (e.g. StonkFun, LetsBonk) and to the token creator.',
    },
    breakdownMethodology: {
        Fees: {
            'Protocol Fee': 'Raydium\'s cut of each trade (0.25% on the default config).',
            'Launch Platform Fee': 'Fee taken by the front-end that configured the launch, set per platform config (1% on the default config).',
            'Token Creator Fee': 'Fee taken by the wallet that created the token.',
        },
        Revenue: {
            'Protocol Fee': 'Raydium\'s cut of each trade.',
        },
        SupplySideRevenue: {
            'Launch Platform Fee': 'Paid to the launch platform, claimed via claim_platform_fee.',
            'Token Creator Fee': 'Paid to the token creator, claimed via claim_creator_fee.',
        },
    },
}

export default adapter
