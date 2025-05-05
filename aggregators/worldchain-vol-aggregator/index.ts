import { FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

    // https://dune.com/queries/5057875/8351848
    const data = await queryDuneSql(options, `
        WITH token_price AS (
            SELECT * FROM prices.hour
            WHERE
                blockchain = 'worldchain'
              AND timestamp > TRY_CAST('2025-04-16 00:00:00' AS TIMESTAMP)
            ), eth_price AS (
        SELECT * FROM prices.hour
        WHERE
            blockchain = 'worldchain'
          AND timestamp > TRY_CAST('2025-04-16 00:00:00' AS TIMESTAMP)
          AND symbol = 'ETH'
            ), swap_token_evt AS (
        SELECT
            DATE_TRUNC('hour', evt_block_time) AS evt_block_hour,
            evt_block_time,
            evt_block_number,
            evt_block_date,
            evt_tx_hash,
            buyToken,
            sellToken,
            CASE
            WHEN buyToken = 0x2cfc85d8e48f8eab294be644d9e25c3030863003
            THEN buyToken
            WHEN sellToken = 0x2cfc85d8e48f8eab294be644d9e25c3030863003
            THEN sellToken
            WHEN feeToken = 0
            THEN buyToken
            WHEN feeToken = 1
            THEN sellToken
            ELSE NULL
            END AS cal_token_address,
            CASE
            WHEN buyToken = 0x2cfc85d8e48f8eab294be644d9e25c3030863003
            THEN amountBought
            WHEN sellToken = 0x2cfc85d8e48f8eab294be644d9e25c3030863003
            THEN amountSold
            WHEN feeToken = 0
            THEN amountBought
            WHEN feeToken = 1
            THEN amountSold
            ELSE NULL
            END AS amount,
            'tokenToToken' AS swap_type
        FROM holdstation_swap_agg_wld_worldchain.swap_agg_evt_fillquotetokentotoken
            ), swap_eth_evt AS (
        SELECT
            DATE_TRUNC('hour', evt_block_time) AS evt_block_hour,
            evt_block_time,
            evt_block_number,
            evt_block_date,
            evt_tx_hash,
            buyToken,
            0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee As sellToken,
            0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee AS cal_token_address,
            amountSold as amount,
            'ethToToken' AS swap_type
        FROM holdstation_swap_agg_wld_worldchain.swap_agg_evt_fillquoteethtotoken
        UNION ALL
        SELECT
            DATE_TRUNC('hour', evt_block_time) AS evt_block_hour,
            evt_block_time,
            evt_block_number,
            evt_block_date,
            evt_tx_hash,
            0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee as buyToken,
            sellToken,
            0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee AS cal_token_address,
            amountBought as amount,
            'tokenToEth' AS swap_type
        FROM holdstation_swap_agg_wld_worldchain.swap_agg_evt_fillquotetokentoeth
            ),decoded_tx_list AS (
        SELECT
            swap_token_evt.*,
            token_price.price,
            token_price.decimals,
            swap_token_evt.amount * token_price.price / POWER(10, token_price.decimals) AS amount_in_usd
        FROM swap_token_evt
            LEFT JOIN token_price
        ON swap_token_evt.cal_token_address = token_price.contract_address
            AND swap_token_evt.evt_block_hour = token_price.timestamp
        UNION ALL
        SELECT
            swap_eth_evt.*,
            eth_price.price,
            eth_price.decimals,
            swap_eth_evt.amount * eth_price.price / POWER(10, eth_price.decimals) AS amount_in_usd
        FROM swap_eth_evt
            LEFT JOIN eth_price
        ON swap_eth_evt.evt_block_hour = eth_price.timestamp
            )
        SELECT
            evt_block_date,
            count(evt_tx_hash) as count_tx,
            SUM(COUNT(evt_tx_hash)) OVER (ORDER BY evt_block_date) as cumulative_tx_count,
                SUM(amount_in_usd) AS daily_volume,
            SUM(SUM(amount_in_usd)) OVER (ORDER BY evt_block_date) AS cumulative_volume
        FROM decoded_tx_list
        GROUP BY
            evt_block_date
  `);

    const chainData = data[0];
    if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
    return {
        dailyVolume: chainData.daily_volume,
        totalVolume: chainData.cumulative_volume,
    };
};

const adapter: any = {
    version: 1,
    adapter: {
        ["worldchain"]: {
            fetch,
            start: '2025-04-16',
            meta: {
                methodology: {
                    totalVolume:
                        "Volume is calculated by summing the token volume of all trades settled on the protocol since launch.",
                    dailyVolume:
                        "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
                },
            },
        },
    },
};

export default adapter;