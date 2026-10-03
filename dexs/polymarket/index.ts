import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {
  // https://dune.com/queries/4172945
  const data: any[] = await queryDuneSql(options, `
    with markets AS (
        SELECT
            fixedProductMarketMaker
        FROM
            polymarketfactory_polygon.FixedProductMarketMakerFactory_evt_FixedProductMarketMakerCreation
        WHERE
            collateralToken = 0x2791bca1f2de4661ed88a30c99a7a9449aa84174
    ),
    unnested_data AS (
        SELECT 
            TRY_CAST(json_each.value AS JSON) AS market
        FROM 
            dune.fergmolina.result_polymarket_gamma_api,  
            UNNEST(TRY_CAST(json_parse(json_data) AS array(json))) AS json_each(value)
    ),
    market_data as (
        SELECT distinct
            JSON_EXTRACT_SCALAR(market, '$.question') AS question,
            JSON_EXTRACT_SCALAR(market, '$.conditionId') AS condition_id,
            JSON_EXTRACT_SCALAR(market, '$.slug') AS slug,
            JSON_EXTRACT_SCALAR(market, '$.icon') AS icon,
            JSON_EXTRACT_SCALAR(market, '$.description') AS description,
            CASE WHEN from_hex(JSON_EXTRACT_SCALAR(market, '$.marketMakerAddress')) <> 0x THEN from_hex(JSON_EXTRACT_SCALAR(market, '$.marketMakerAddress')) END AS market_maker_address,
            CAST(JSON_EXTRACT_SCALAR(market, '$.new') AS BOOLEAN) AS new,
            CAST(JSON_EXTRACT_SCALAR(market, '$.archived') AS BOOLEAN) AS archived,
            JSON_EXTRACT_SCALAR(market, '$.questionID') AS question_id,
            CAST(JSON_EXTRACT_SCALAR(market, '$.restricted') as varchar) AS restricted,
            CAST(JSON_EXTRACT_SCALAR(event.value, '$.negRisk') as boolean) AS neg_risk,
            ltrim(outcome.value) AS outcome,
            ltrim(clobTokenId.value) AS clob_token_id,
            JSON_EXTRACT_SCALAR(event.value, '$.title') AS event_title,
            JSON_EXTRACT_SCALAR(event.value, '$.slug') AS event_slug
        FROM 
            unnested_data
            , UNNEST(split(REPLACE(REPLACE(REPLACE(TRY_CAST(JSON_EXTRACT(market, '$.outcomes') AS varchar),'"',''),']',''),'[',''),',')) WITH ORDINALITY AS outcome(value, outcome_ordinality)
            , UNNEST(split(REPLACE(REPLACE(REPLACE(TRY_CAST(JSON_EXTRACT(market, '$.clobTokenIds') AS varchar),'"',''),']',''),'[',''),',')) WITH ORDINALITY AS clobTokenId(value, clobToken_ordinality)
            , UNNEST(TRY_CAST(JSON_EXTRACT(market, '$.events') AS ARRAY(JSON))) AS event(value)

        WHERE outcome_ordinality = clobToken_ordinality
    ),
    polymarket_market_data as (
        select * from market_data
    ),
    v2_fills AS (
        SELECT
            evt_tx_hash,
            contract_address,
            evt_index,
            orderHash,
            taker,
            side AS maker_side,
            CASE
                WHEN side = 0 THEN makerAmountFilled
                WHEN side = 1 THEN takerAmountFilled
            END AS cash_amount,
            CASE
                WHEN side = 0 THEN takerAmountFilled
                WHEN side = 1 THEN makerAmountFilled
            END AS token_amount
        FROM polymarket_v2_polygon.ctfexchange_evt_orderfilled
        WHERE evt_block_number > 85050371
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    v2_matches_raw AS (
        SELECT
            evt_tx_hash,
            contract_address,
            evt_index AS match_index,
            takerOrderHash,
            takerOrderMaker,
            side AS taker_side
        FROM polymarket_v2_polygon.ctfexchange_evt_ordersmatched
        WHERE evt_block_number > 85050371
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    v2_matches AS (
        SELECT
            *,
            lag(match_index, 1, CAST(-1 AS bigint)) OVER (
                PARTITION BY evt_tx_hash, contract_address
                ORDER BY match_index
            ) AS previous_match_index
        FROM v2_matches_raw
    ),
    v2_matched_fills AS (
        SELECT
            f.*,
            m.takerOrderHash,
            m.taker_side
        FROM v2_fills f
        JOIN v2_matches m
            ON f.evt_tx_hash = m.evt_tx_hash
            AND f.contract_address = m.contract_address
            AND f.evt_index > m.previous_match_index
            AND f.evt_index < m.match_index
            AND (
                f.orderHash = m.takerOrderHash
                OR f.taker = m.takerOrderMaker
            )
    ),
    v2_unmatched_fills AS (
        SELECT f.*
        FROM v2_fills f
        LEFT JOIN v2_matched_fills m
            ON f.evt_tx_hash = m.evt_tx_hash
            AND f.contract_address = m.contract_address
            AND f.evt_index = m.evt_index
        WHERE m.evt_index IS NULL
    ),
    legacy_fills AS (
        SELECT
            'ctf' AS exchange_type,
            evt_tx_hash,
            contract_address,
            evt_index,
            orderHash,
            taker,
            CASE
                WHEN makerAssetId = 0 THEN 0
                WHEN takerAssetId = 0 THEN 1
            END AS maker_side,
            CASE
                WHEN makerAssetId = 0 THEN makerAmountFilled
                WHEN takerAssetId = 0 THEN takerAmountFilled
            END AS cash_amount,
            CASE
                WHEN makerAssetId = 0 THEN takerAmountFilled
                WHEN takerAssetId = 0 THEN makerAmountFilled
            END AS token_amount
        FROM polymarket_polygon.CTFExchange_evt_OrderFilled
        WHERE evt_block_number > 33605403
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})

        UNION ALL

        SELECT
            'negrisk' AS exchange_type,
            evt_tx_hash,
            contract_address,
            evt_index,
            orderHash,
            taker,
            CASE
                WHEN makerAssetId = 0 THEN 0
                WHEN takerAssetId = 0 THEN 1
            END AS maker_side,
            CASE
                WHEN makerAssetId = 0 THEN makerAmountFilled
                WHEN takerAssetId = 0 THEN takerAmountFilled
            END AS cash_amount,
            CASE
                WHEN makerAssetId = 0 THEN takerAmountFilled
                WHEN takerAssetId = 0 THEN makerAmountFilled
            END AS token_amount
        FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled
        WHERE evt_block_number > 50505492
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    legacy_matches_raw AS (
        SELECT
            'ctf' AS exchange_type,
            evt_tx_hash,
            contract_address,
            evt_index AS match_index,
            takerOrderHash,
            takerOrderMaker,
            CASE
                WHEN makerAssetId = 0 THEN 0
                WHEN takerAssetId = 0 THEN 1
            END AS taker_side
        FROM polymarket_polygon.CTFExchange_evt_OrdersMatched
        WHERE evt_block_number > 33605403
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})

        UNION ALL

        SELECT
            'negrisk' AS exchange_type,
            evt_tx_hash,
            contract_address,
            evt_index AS match_index,
            takerOrderHash,
            takerOrderMaker,
            CASE
                WHEN makerAssetId = 0 THEN 0
                WHEN takerAssetId = 0 THEN 1
            END AS taker_side
        FROM polymarket_polygon.NegRiskCtfExchange_evt_OrdersMatched
        WHERE evt_block_number > 50505492
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})
    ),
    legacy_matches AS (
        SELECT
            *,
            lag(match_index, 1, CAST(-1 AS bigint)) OVER (
                PARTITION BY exchange_type, evt_tx_hash, contract_address
                ORDER BY match_index
            ) AS previous_match_index
        FROM legacy_matches_raw
    ),
    legacy_matched_fills AS (
        SELECT
            f.*,
            m.takerOrderHash,
            m.taker_side
        FROM legacy_fills f
        JOIN legacy_matches m
            ON f.exchange_type = m.exchange_type
            AND f.evt_tx_hash = m.evt_tx_hash
            AND f.contract_address = m.contract_address
            AND f.evt_index > m.previous_match_index
            AND f.evt_index < m.match_index
            AND (
                f.orderHash = m.takerOrderHash
                OR f.taker = m.takerOrderMaker
            )
    ),
    legacy_unmatched_fills AS (
        SELECT f.*
        FROM legacy_fills f
        LEFT JOIN legacy_matched_fills m
            ON f.exchange_type = m.exchange_type
            AND f.evt_tx_hash = m.evt_tx_hash
            AND f.contract_address = m.contract_address
            AND f.evt_index = m.evt_index
        WHERE m.evt_index IS NULL
    )
    SELECT
        SUM(volume_usd) AS total_volume_usd,
        SUM(notional_volume) AS total_notional_volume
    FROM (
        SELECT
            SUM(
                CASE
                    WHEN maker_side = taker_side THEN token_amount
                    ELSE cash_amount
                END
            ) / 1e6 AS volume_usd,
            SUM(token_amount) / 1e6 AS notional_volume
        FROM v2_matched_fills
        WHERE orderHash <> takerOrderHash

        UNION ALL

        SELECT
            SUM(cash_amount) / 2e6 AS volume_usd,
            SUM(token_amount) / 2e6 AS notional_volume
        FROM v2_unmatched_fills

        UNION ALL

        SELECT
            SUM(
                CASE
                    WHEN maker_side = taker_side THEN token_amount
                    ELSE cash_amount
                END
            ) / 1e6 AS volume_usd,
            SUM(token_amount) / 1e6 AS notional_volume
        FROM legacy_matched_fills
        WHERE orderHash <> takerOrderHash

        UNION ALL

        SELECT
            SUM(cash_amount) / 2e6 AS volume_usd,
            SUM(token_amount) / 2e6 AS notional_volume
        FROM legacy_unmatched_fills

        UNION ALL

        SELECT
            bytearray_to_uint256(substr(pl.DATA, 1, 32)) / 1e6 AS volume_usd,
            bytearray_to_uint256(substr(pl.DATA, 65, 96)) / 1e6 AS notional_volume
        FROM polygon.logs pl
        LEFT JOIN polymarket_market_data md
            ON pl.contract_address = md.market_maker_address
        WHERE pl.topic0 IN (
            0x4f62630f51608fc8a7603a9391a5101e58bd7c276139366fc107dc3b67c3dcf8,
            0xadcf2a240ed9300d681d9a3f5382b6c1beed1b7e46643e0c7b42cbe6e2d766b4
        )
            AND pl.block_number >= 4023680
            AND pl.contract_address IN (
                SELECT * FROM markets
            )
            AND pl.block_time >= from_unixtime(${options.startTimestamp})
            AND pl.block_time < from_unixtime(${options.endTimestamp})
    ) as combined_volumes
  `);

  options.api.log(data);

  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  dailyVolume.addUSDValue(data[0].total_volume_usd);
  dailyNotionalVolume.addUSDValue(data[0].total_notional_volume);

  return { dailyVolume, dailyNotionalVolume }
}

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
  dependencies: [Dependencies.DUNE],
  start: '2020-09-30',
  isExpensiveAdapter: true,
}

export default adapters
