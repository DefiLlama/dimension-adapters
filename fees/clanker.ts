import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { addTokensReceived } from "../helpers/token";

const BUY_BACK_WALLETS = [
    '0x8d4ab2a3e89eadfdc729204adf863a0bfc7746f6',
];

const BUY_BACK_TOKEN = '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const res = await queryDuneSql(options, `
        WITH created_contracts AS (
            /* ---------- V31 (added) ---------- */
            SELECT 
                'Clanker' AS projects,
                tokenAddress 
            FROM 
                clanker_base.Clanker_v31_evt_TokenCreated
            WHERE evt_block_time > TIMESTAMP '2024-11-27'
                AND evt_block_time <= from_unixtime(${options.endTimestamp})

            UNION ALL

            /* ---------- V4 (added) ---------- */
            SELECT 
                'Clanker' AS projects,
                tokenAddress 
            FROM 
                clanker_v4_base.clanker_evt_tokencreated
            WHERE evt_block_time > TIMESTAMP '2024-11-08'
                AND evt_block_time <= from_unixtime(${options.endTimestamp})

            UNION ALL

            /* ---------- V3 (existing) ---------- */
            SELECT
                'Clanker' as projects,
                tokenAddress 
            FROM clanker_base.Clanker_v3_evt_TokenCreated
            WHERE evt_block_time > TIMESTAMP '2024-11-08'
                AND evt_block_time <= from_unixtime(${options.endTimestamp})

            UNION ALL

            /* ---------- V2 (existing) ---------- */
            SELECT
                'Clanker' as projects,
                tokenAddress 
            FROM clanker_base.Clanker_v2_evt_TokenCreated
            WHERE evt_block_time > TIMESTAMP '2024-11-08'
                AND evt_block_time <= from_unixtime(${options.endTimestamp})

            UNION ALL

            /* ---------- V1 (existing) ---------- */
            SELECT
                'Clanker' as projects,
                tokenAddress 
            FROM clanker_base.Clanker_V1_evt_TokenCreated
            WHERE evt_block_time > TIMESTAMP '2024-11-27'
                AND evt_block_time <= from_unixtime(${options.endTimestamp})

            UNION ALL

            /* ---------- V0 - SocialDex (existing) ---------- */
            SELECT 
                'Clanker' AS projects,
                tokenAddress 
            FROM 
                socialdex_base.SocialDexDeployer_evt_TokenCreated
            WHERE evt_block_time > TIMESTAMP '2024-11-08'
                AND evt_block_time <= from_unixtime(${options.endTimestamp})
                AND evt_tx_from IN (0xe0c959eedcfd004952441ea4fb4b8f5af424e74b,
                                0xc204af95b0307162118f7bc36a91c9717490ab69)
        ),
        dex_trades AS (
            SELECT 
                * 
            FROM 
                dex.trades t
            WHERE 
                t.blockchain = 'base' 
                AND t.block_time >= from_unixtime(${options.startTimestamp})
                AND t.block_time < from_unixtime(${options.endTimestamp})
                AND amount_usd > 1
        ),
        daily_fees AS (
            SELECT 
                SUM(amount_usd * 0.01) AS df 
            FROM 
                dex_trades t 
            INNER JOIN 
                created_contracts a 
            ON 
                a.tokenAddress = t.token_bought_address
            WHERE 
                t.blockchain = 'base' 
                AND TIME_RANGE
                AND amount_usd > 1

            UNION ALL

            SELECT 
                SUM(amount_usd * 0.01) AS df 
            FROM 
                dex_trades t 
            INNER JOIN 
                created_contracts a 
            ON 
                a.tokenAddress = t.token_sold_address
            WHERE 
                t.blockchain = 'base' 
                AND TIME_RANGE
                AND amount_usd > 1
        )
        SELECT 
            SUM(df) AS daily_fees_usd 
        FROM 
            daily_fees
    `);

    dailyFees.addUSDValue(res[0].daily_fees_usd);
    const dailyProtocolRevenue = dailyFees.clone(0.2) // 20% of fees to protocol

    const dailyHoldersRevenue = options.createBalances();
    await addTokensReceived({
        options,
        balances: dailyHoldersRevenue,
        targets: BUY_BACK_WALLETS,
        tokens: [BUY_BACK_TOKEN],
    })

    return {
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.BASE],
    start: "2024-11-08",
    dependencies: [Dependencies.DUNE],
    methodology: {
        Fees: "All trading and launching tokens fees paid by users.",
        Revenue: "Clanker protocol collects 20% of LP fees.",
        ProtocolRevenue: "Clanker protocol collects 20% of LP fees.",
        HoldersRevenue: "Amount of CLANKER tokens buy back.",
    }
};

export default adapter;
