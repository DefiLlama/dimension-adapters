import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyVolume = options.createBalances();

    const query = `with trade_data as (
        select
            (tradeAddresses) [1] as buy_token,
            (tradeAddresses) [2] as sell_token,
            (tradeValues) [1] as buy_amount,
            (tradeValues) [2] as sell_amount,
            (tradeValues) [5] as trade_amount,
            LEAST(1e17, (tradeValues) [7]) as maker_fee,
            LEAST(1e17, (tradeValues) [8]) as taker_fee
        from idex_ethereum.idex1_call_trade
        where call_success = true
            and call_block_time >= from_unixtime(${options.fromTimestamp})
            and call_block_time < from_unixtime(${options.toTimestamp})
        ),
        volume_data as (
            select
                buy_token,
                SUM(trade_amount) as net_trade_amount
            from trade_data
            group by
                buy_token
        ),
        maker_fee_data as (
            select
                buy_token,
                sum((trade_amount * maker_fee) / 1e18) as net_maker_fee
            from trade_data
            group by
                buy_token
        ),
        taker_fee_data as (
            select
                sell_token,
                sum((((taker_fee * sell_amount) * trade_amount) / (buy_amount)) / 1e18) as net_taker_fee
            from trade_data
            group by
                sell_token
        )
        select
            COALESCE(v.buy_token, m.buy_token, t.sell_token) as token,
            COALESCE(v.net_trade_amount, 0) as volume,
            COALESCE(m.net_maker_fee, 0) as maker_fee,
            COALESCE(t.net_taker_fee, 0) as taker_fee
        from volume_data v
            full outer join maker_fee_data m on v.buy_token = m.buy_token
            full outer join taker_fee_data t on COALESCE(v.buy_token, m.buy_token) = t.sell_token;
    `

    const queryResult = await queryDuneSql(options, query);

    for (const tradeData of queryResult) {
        dailyVolume.add(tradeData.token, tradeData.volume);
        dailyFees.add(tradeData.token, Number(tradeData.maker_fee) + Number(tradeData.taker_fee));
    };

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
        dailyHoldersRevenue: 0,
    };
}

const methodology = {
    Volume: "Idex trade volume",
    Fees: "Maker and Taker fees paid by traders",
    UserFees: "Maker and Taker fees paid by traders",
    ProtocolRevenue: "Maker and Taker fees paid by traders",
    Revenue: "Maker and Taker fees paid by traders",
    HoldersRevenue: "No Holder Revenue",
};

const adapter: SimpleAdapter = {
    deadFrom: '2020-10-20',
    fetch,
    chains: [CHAIN.ETHEREUM],
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology,
    start: '2018-05-13'
};

export default adapter;