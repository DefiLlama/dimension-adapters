import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {

    const query = `with trade_data as (
    select
                BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 24, 8))) / 1e6 as fees,
        case
            when bytearray_substring (data, 1, 1) = from_hex('b3') --buy
            then 
                    BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 16, 8))) / 1e6 + 
                    BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 24, 8))) / 1e6
            when bytearray_substring (data, 1, 1) = from_hex('fb') --sell
            then 
                    BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 16, 8))) / 1e6
            end as volume
        from solana.instruction_calls
        where block_time >= from_unixtime(${options.fromTimestamp})
            and block_time< from_unixtime(${options.toTimestamp})
            and executing_account = '3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp'
        and (bytearray_substring (data, 1, 1) = from_hex('fb')
            or bytearray_substring (data, 1, 1) = from_hex('b3'))
        and tx_success
        and cardinality(log_messages) > 10)

        select
            sum(volume) as total_volume,
            sum(fees) as total_fees
            from trade_data`;

    const queryResult = await queryDuneSql(options, query);

    if (!queryResult[0] || !queryResult[0].total_volume || !queryResult[0].total_fees)
        throw new Error('Jupiter prediction dune data not found');

    const dailyVolume = queryResult[0].total_volume;
    const dailyFees = queryResult[0].total_fees;

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: 0,
        dailyHoldersRevenue: 0,
        dailyProtocolRevenue: 0,
    }
}

const methodology = {
    Volume: 'Volume of all trades through jupiter interface',
    Fees: 'Venue fees paid by users',
    Revenue: 'Jupiter doesnt keep any fees as of now, all the fees goes to kalshi',
    HoldersRevenue: 'No holders revenue',
    ProtocolRevenue: 'No protocol revenue',
}

const adapter: SimpleAdapter = {
    fetch,
    methodology,
    isExpensiveAdapter: true,
    dependencies: [Dependencies.DUNE],
    start: '2025-10-21',
    chains:[CHAIN.SOLANA]
}

export default adapter;