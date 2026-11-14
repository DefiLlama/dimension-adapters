import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// The query used to LEFT JOIN legacy AMM trade logs to dune.fergmolina.result_polymarket_gamma_api, which was deleted
// from Dune in 2026-10. That join could repeat AMM rows, so days with Polymarket AMM trades can't be reproduced and must
// not be refilled. The last trade on a USDC.e FPMM over Polymarket's ConditionalTokens was 2025-04-07
// (tx 0x899639bffa2cc5dcdcbf30c938946fe85ad4e870bc9fcc24c5c0ba7b3a6b149c), so later days match the stored history.
const LEGACY_AMM_CUTOFF = '2025-04-08'

const fetch = async (options: FetchOptions) => {
  if (options.dateString < LEGACY_AMM_CUTOFF)
    throw new Error(`polymarket: days before ${LEGACY_AMM_CUTOFF} include legacy AMM volume and can no longer be refilled, see the comment above LEGACY_AMM_CUTOFF`)

  // https://dune.com/queries/4172945
  const data: any[] = await queryDuneSql(options, `
    with markets AS (
        SELECT
            fixedProductMarketMaker
        FROM
            polymarketfactory_polygon.FixedProductMarketMakerFactory_evt_FixedProductMarketMakerCreation
        WHERE
            collateralToken = 0x2791bca1f2de4661ed88a30c99a7a9449aa84174
    )
    SELECT
        SUM(volume_usd) AS total_volume_usd,
        SUM(notional_volume) AS total_notional_volume
    FROM (
        SELECT
            SUM(
                CASE
                    WHEN side = 0 THEN makerAmountFilled
                    WHEN side = 1 THEN takerAmountFilled
                END
            ) / 1e6 AS volume_usd,
            SUM(
                CASE
                    WHEN side = 0 THEN takerAmountFilled
                    WHEN side = 1 THEN makerAmountFilled
                END
            ) / 1e6 AS notional_volume
        FROM
            polymarket_v2_polygon.ctfexchange_evt_orderfilled a --includes both ctf and negrisk
        WHERE
            a.evt_block_number > 85050371
            AND a.taker = a.contract_address -- taker order leg only, see the comment below the query
            AND evt_block_time >= from_unixtime(${options.startTimestamp})
            AND evt_block_time < from_unixtime(${options.endTimestamp})

        UNION ALL
        
        SELECT
            SUM(CASE
                    WHEN makerAssetId = 0 THEN makerAmountFilled
                    WHEN takerAssetId = 0 THEN takerAmountFilled
                END) / 1e6 as volume_usd,
            SUM(CASE
                    WHEN makerAssetId = 0 THEN takerAmountFilled
                    WHEN takerAssetId = 0 THEN makerAmountFilled
                END) / 1e6 as notional_volume
        FROM polymarket_polygon.NegRiskCtfExchange_evt_OrderFilled b
        where b.evt_block_number > 50505492
            and b.taker = b.contract_address
            and evt_block_time >= from_unixtime(${options.startTimestamp})
            and evt_block_time < from_unixtime(${options.endTimestamp})

        UNION ALL

        SELECT
            SUM(CASE
                    WHEN makerAssetId = 0 THEN makerAmountFilled
                    WHEN takerAssetId = 0 THEN takerAmountFilled
                END) / 1e6 as volume_usd,
            SUM(CASE
                    WHEN makerAssetId = 0 THEN takerAmountFilled
                    WHEN takerAssetId = 0 THEN makerAmountFilled
                END) / 1e6 as notional_volume
        FROM polymarket_polygon.CTFExchange_evt_OrderFilled a
        where a.evt_block_number > 33605403
            and a.taker = a.contract_address
            and evt_block_time >= from_unixtime(${options.startTimestamp})
            and evt_block_time < from_unixtime(${options.endTimestamp})

        UNION ALL

        select
            bytearray_to_uint256(substr(pl.DATA, 1, 32)) / 1e6 as volume_usd,
            bytearray_to_uint256(substr(pl.DATA, 65, 96)) / 1e6 as notional_volume
        from
            polygon.logs pl
        where
            pl.topic0 in (
                0x4f62630f51608fc8a7603a9391a5101e58bd7c276139366fc107dc3b67c3dcf8,
                0xadcf2a240ed9300d681d9a3f5382b6c1beed1b7e46643e0c7b42cbe6e2d766b4
            )
            AND pl.block_number >= 4023680
            AND pl.contract_address in (
                SELECT * FROM markets
            )
            and pl.block_time >= from_unixtime(${options.startTimestamp})
            and pl.block_time < from_unixtime(${options.endTimestamp})
    ) as combined_volumes
  `);

  options.api.log(data);

  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  // matchOrders emits one OrderFilled per maker order plus one for the taker order, whose `taker` is the exchange itself
  // (ctf-exchange Trading.sol, v1 and v2). Only that taker leg is counted: it is Polymarket's own definition ("Only taker
  // volume is counted", https://data.polymarket.com); with dexs/polymarket-combos it reproduces Polymarket's daily dollar
  // and contract volume (US Eastern days). v1 fillOrder fills have no taker leg and are not counted. Halving all legs
  // matches it only for buy-vs-sell matches: in a mint (two buys) or merge (two sells) the legs are the two complementary
  // prices, so the half is S/2 for S shares whatever the taker paid. Shares are unchanged: taker shares = all shares / 2.

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
  methodology: {
    Volume: "Collateral paid or received by the taker order of each matched trade on Polymarket's CTF exchanges, the definition Polymarket uses for its own volume.",
    NotionalVolume: "Outcome shares bought or sold by the taker order of each matched trade, each share paying $1 if its outcome wins.",
  },
}

export default adapters
