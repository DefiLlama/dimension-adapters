import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const DUNE_TABLE = {
    [CHAIN.ETHEREUM]: 'idex_ethereum.exchange_call_executetrade',
    [CHAIN.BSC]: 'idex_v3_bnb.exchange_call_executetrade',
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyRevenue = options.createBalances();
    const dailyVolume = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const tableName = DUNE_TABLE[options.chain as keyof typeof DUNE_TABLE];

    const bscEthQuery = `WITH trade_data AS (
        SELECT
            JSON_EXTRACT_SCALAR(trade, '$.quoteAssetAddress') AS quoteAssetAddress,
            TRY_CAST(JSON_EXTRACT_SCALAR(trade, '$.grossQuoteQuantityInPips') AS DECIMAL) AS quoteQuantity,
            JSON_EXTRACT_SCALAR(trade, '$.makerFeeAssetAddress') AS makerFeeAssetAddress,
            JSON_EXTRACT_SCALAR(trade, '$.takerFeeAssetAddress') AS takerFeeAssetAddress,
            TRY_CAST(JSON_EXTRACT_SCALAR(trade, '$.makerFeeQuantityInPips') AS DECIMAL) AS makerFee,
            TRY_CAST(JSON_EXTRACT_SCALAR(trade, '$.takerFeeQuantityInPips') AS DECIMAL) AS takerFee
        FROM ${tableName}
        WHERE call_success = true
            AND call_block_time >= from_unixtime(${options.fromTimestamp})
            AND call_block_time < from_unixtime(${options.toTimestamp})
    ), volume_data AS (
        SELECT
            quoteAssetAddress,
            SUM(quoteQuantity) AS net_volume
        FROM trade_data
        GROUP BY
    quoteAssetAddress
    ), maker_fee_data AS (
        SELECT
            makerFeeAssetAddress,
            SUM(makerFee) AS net_maker_fee
        FROM trade_data
        GROUP BY
    makerFeeAssetAddress
    ), taker_fee_data AS (
        SELECT
            takerFeeAssetAddress,
            SUM(takerFee) AS net_taker_fee
        FROM trade_data
        GROUP BY
    takerFeeAssetAddress
    )
        SELECT
            COALESCE(v.quoteAssetAddress, m.makerFeeAssetAddress, t.takerFeeAssetAddress) AS token_address,
            COALESCE(v.net_volume, 0) AS volume,
            COALESCE(m.net_maker_fee, 0) AS maker_fee,
            COALESCE(t.net_taker_fee, 0) AS taker_fee
        FROM volume_data AS v
        FULL OUTER JOIN maker_fee_data AS m
            ON v.quoteAssetAddress = m.makerFeeAssetAddress
        FULL OUTER JOIN taker_fee_data AS t
            ON COALESCE(v.quoteAssetAddress, m.makerFeeAssetAddress) = t.takerFeeAssetAddress;
    `
    const polygonQuery = `with
        unified_trades as ((
            select
                JSON_EXTRACT_SCALAR(orderBookTrade, '$.quoteAssetAddress') as token_address,
                TRY_CAST(JSON_EXTRACT_SCALAR(orderBookTrade, '$.grossQuoteQuantityInPips') as DECIMAL) as volume,
                TRY_CAST(JSON_EXTRACT_SCALAR(orderBookTrade, '$.makerFeeQuantityInPips') as DECIMAL) as maker_fee,
                TRY_CAST(JSON_EXTRACT_SCALAR(orderBookTrade, '$.takerFeeQuantityInPips') as DECIMAL) as taker_fee,
                JSON_EXTRACT_SCALAR(orderBookTrade, '$.makerFeeAssetAddress') as maker_fee_asset_address,
                JSON_EXTRACT_SCALAR(orderBookTrade, '$.takerFeeAssetAddress') as taker_fee_asset_address,
                null as fee_asset_address,
                null as protocol_fee,
                null as pool_fee
            from idex_v3_polygon.exchange_v3_1_call_executeorderbooktrade
            where call_success = true
                and call_block_time >= from_unixtime(${options.fromTimestamp})
                and call_block_time < from_unixtime(${options.toTimestamp})
            )
        union all
        (
            select
                JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.orderBookTrade'),
                '$.quoteAssetAddress') as token_address,
                TRY_CAST(JSON_EXTRACT_SCALAR(
                    JSON_EXTRACT_SCALAR(hybridTrade, '$.orderBookTrade'),
                    '$.grossQuoteQuantityInPips') as DECIMAL) as volume,
                TRY_CAST(JSON_EXTRACT_SCALAR(
                    JSON_EXTRACT_SCALAR(hybridTrade, '$.orderBookTrade'),
                    '$.makerFeeQuantityInPips') as DECIMAL) as maker_fee,
                TRY_CAST(JSON_EXTRACT_SCALAR(
                    JSON_EXTRACT_SCALAR(hybridTrade, '$.orderBookTrade'),
                    '$.takerFeeQuantityInPips') as DECIMAL) as taker_fee,
                JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.orderBookTrade'), '$.makerFeeAssetAddress') as maker_fee_asset_address,
                JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.orderBookTrade'), '$.takerFeeAssetAddress') as taker_fee_asset_address,
                null as fee_asset_address,
                null as protocol_fee,
                null as pool_fee
            from idex_v3_polygon.exchange_v3_1_call_executehybridtrade
            where call_success = true
                and call_block_time >= from_unixtime(${options.fromTimestamp})
            and call_block_time < from_unixtime(${options.toTimestamp})
        )
        union all
        (
            select
                JSON_EXTRACT_SCALAR(poolTrade, '$.quoteAssetAddress') as tokenAddress,
                TRY_CAST(JSON_EXTRACT_SCALAR(poolTrade, '$.grossQuoteQuantityInPips') as DECIMAL) as volume,
                null as maker_fee,
                null as taker_fee,
                null as maker_fee_asset_address,
                null as taker_fee_asset_address,
                JSON_EXTRACT_SCALAR(poolTrade, '$.quoteAssetAddress') as fee_asset_address,
                TRY_CAST(JSON_EXTRACT_SCALAR(poolTrade, '$.takerProtocolFeeQuantityInPips') as DECIMAL) as protocol_fee,
                TRY_CAST(JSON_EXTRACT_SCALAR(poolTrade, '$.takerPoolFeeQuantityInPips') as DECIMAL) as pool_fee
            from idex_v3_polygon.exchange_v3_1_call_executepooltrade
            where call_success = true
                and call_block_time >= from_unixtime(${options.fromTimestamp})
            and call_block_time < from_unixtime(${options.toTimestamp})
        )
        union all
        (
            select
                JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.poolTrade'),'$.quoteAssetAddress') as token_address,
            TRY_CAST(
                    JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.poolTrade'), '$.grossQuoteQuantityInPips') as DECIMAL
                ) as volume,
                null as maker_fee,
                null as taker_fee,
                null as maker_fee_asset_address,
                null as taker_fee_asset_address,
                JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.poolTrade'), '$.quoteAssetAddress') as fee_asset_address,
                TRY_CAST(JSON_EXTRACT_SCALAR(
                        JSON_EXTRACT_SCALAR(hybridTrade, '$.poolTrade'),
                '$.takerProtocolFeeQuantityInPips'
            ) as DECIMAL) as protocol_fee,
            TRY_CAST(
                    JSON_EXTRACT_SCALAR(JSON_EXTRACT_SCALAR(hybridTrade, '$.poolTrade'), '$.takerPoolFeeQuantityInPips') as DECIMAL
                ) as pool_fee
            from idex_v3_polygon.exchange_v3_1_call_executehybridtrade
            where call_success = true
                and call_block_time >= from_unixtime(${options.fromTimestamp})
                and call_block_time < from_unixtime(${options.toTimestamp})
            )
            ),
        volume_data as (
        select
            token_address,
            SUM(COALESCE(volume, 0)) as total_volume
        from unified_trades
        group by
            token_address),
        maker_fee_data as (
        select
            maker_fee_asset_address as fee_address,
            SUM(COALESCE(maker_fee, 0)) as total_maker_fee
        from unified_trades
        where maker_fee_asset_address is not null
        group by
            maker_fee_asset_address
        ),
        taker_fee_data as (
        select
            taker_fee_asset_address as fee_address,
            SUM(COALESCE(taker_fee, 0)) as total_taker_fee
        from unified_trades
        where taker_fee_asset_address is not null
        group by
            taker_fee_asset_address
        ),
        pool_fee_data as (
        select
            fee_asset_address as fee_address,
            SUM(COALESCE(protocol_fee, 0)) as total_protocol_fee,
            SUM(COALESCE(pool_fee, 0)) as total_pool_fee
        from unified_trades
        where fee_asset_address is not null
        group by
            fee_asset_address
        )
        select
            COALESCE(v.token_address, m.fee_address, t.fee_address, p.fee_address) as token_address,
            COALESCE(v.total_volume, 0) as volume,
            COALESCE(m.total_maker_fee, 0) as maker_fee,
            COALESCE(t.total_taker_fee, 0) as taker_fee,
            COALESCE(p.total_protocol_fee, 0) as protocol_fee,
            COALESCE(p.total_pool_fee, 0) as pool_fee
        from volume_data v
            full outer join maker_fee_data m on v.token_address = m.fee_address
            full outer join taker_fee_data t on v.token_address = t.fee_address
            full outer join pool_fee_data p on v.token_address = p.fee_address;
    `
    const query = options.chain === 'polygon' ? polygonQuery : bscEthQuery;
    const queryResult = await queryDuneSql(options, query);

    for (const tradeData of queryResult) {
        const tokenAddress = tradeData.token_address
        dailyVolume.add(tokenAddress, Number(tradeData.volume));
        dailyRevenue.add(tokenAddress, Number(tradeData.maker_fee) + Number(tradeData.taker_fee));
        if (options.chain === 'polygon') {
            dailyRevenue.add(tokenAddress, Number(tradeData.protocol_fee));
            dailySupplySideRevenue.add(tokenAddress, Number(tradeData.pool_fee));
        }
    };

    const dailyFees = dailyRevenue.clone();
    dailyFees.add(dailySupplySideRevenue);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailyHoldersRevenue: 0,
        dailySupplySideRevenue
    };
}

const methodology = {
    Volume: "Idex classic trade volume",
    Fees: "Maker fees,Taker fees and protocol fees paid by traders",
    UserFees: "Maker fees,Taker fees and protocol paid by traders",
    Revenue: "All the fees except pool fee",
    ProtocolRevenue: "All the fees except pool fee",
    HoldersRevenue: "No Holder Revenue",
    SupplySideRevenue: "Pool fee paid by traders"
};

const adapter: SimpleAdapter = {
    deadFrom: '2024-05-02',
    fetch,
    adapter: {
        [CHAIN.ETHEREUM]: { start: '2020-10-20', },
        [CHAIN.POLYGON]: { start: '2021-12-26', },
        [CHAIN.BSC]: { start: '2021-01-23' }
    },
    isExpensiveAdapter: true,
    methodology,
};

export default adapter;