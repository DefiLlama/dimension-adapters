import ADDRESSES from '../../helpers/coreAssets.json'

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetchFees = async (timestamp: number, _t: any, options: FetchOptions) => {
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
    )
    SELECT
        day,
        SUM(volume_usd) as total_volume_usd
    FROM (
        SELECT
            DATE_TRUNC('day', evt_block_time) as day,
            SUM(CASE 
                    WHEN makerAssetId = 0 THEN makerAmountFilled
                    WHEN takerAssetId = 0 THEN takerAmountFilled 
                END) / 1e6 as volume_usd
        FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled b
        where b.evt_block_number > 50505492
        and evt_block_time >= NOW() - interval '2' DAY
        GROUP BY 1

        UNION ALL

        SELECT
            DATE_TRUNC('day', evt_block_time) as day,
            SUM(CASE 
                    WHEN makerAssetId = 0 THEN makerAmountFilled
                    WHEN takerAssetId = 0 THEN takerAmountFilled 
                END) / 1e6 as volume_usd
        FROM polymarket_polygon.CTFExchange_evt_OrderFilled a
        where a.evt_block_number > 33605403
        and evt_block_time >= NOW() - interval '2' DAY
        GROUP BY 1

        UNION ALL

        select
            DATE_TRUNC('day', pl.block_time) as day,
            bytearray_to_uint256(substr(pl.DATA, 1, 32)) / 1e6 as volume_usd
        from
            polygon.logs pl
            left join polymarket_market_data md on pl.contract_address = md.market_maker_address
        where
            pl.topic0 in (
                0x4f62630f51608fc8a7603a9391a5101e58bd7c276139366fc107dc3b67c3dcf8,
                0xadcf2a240ed9300d681d9a3f5382b6c1beed1b7e46643e0c7b42cbe6e2d766b4
            )
            AND pl.block_number >= 4023680
            AND pl.contract_address in (
                SELECT
                *
                FROM
                markets
            )
            and pl.block_time >= NOW() - interval '2' DAY
        GROUP BY 1,2
    ) as combined_volumes
    GROUP BY 1
    ORDER BY 1 DESC
  `);

  options.api.log(data);

  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];
  const daily = data.find(e => e.day.split(' ')[0] === dateStr);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(daily.total_volume_usd);
  return {
    timestamp: timestamp,
    dailyVolume: dailyVolume
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2020-09-30',
    }
  },
  isExpensiveAdapter: true,
}

export default adapters
