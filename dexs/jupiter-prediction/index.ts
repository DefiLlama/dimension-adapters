import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { jupBuybackRatioFromRevenue, JUPITER_METRICS } from "../../fees/jupiter";
import { assertJupiterStatsPublished, getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../../helpers/jupiter-stats";

async function fetch(options: FetchOptions): Promise<FetchResult> {

    // From 2026-10-28 16:47 UTC the program fills with fill_buy_order2 / fill_sell_order2, whose Anchor
    // discriminators are sha256("global:fill_buy_order2")[0..8] = 850b5e1c096fe5d1 and
    // sha256("global:fill_sell_order2")[0..8] = 634609a43879ca22. Their data keeps contracts, amount and fee
    // at the same offsets as v1 (b3 / fb) and appends two u64 fields.
    const query = `
        with trade_data as (
            select
                BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 24, 8))) / 1e6 as fees,
                case
                    when bytearray_substring (data, 1, 1) = from_hex('b3') --buy
                        or bytearray_substring (data, 1, 8) = from_hex('850b5e1c096fe5d1') --buy v2
                    then 
                        BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 16, 8))) / 1e6 + 
                        BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 24, 8))) / 1e6
                    when bytearray_substring (data, 1, 1) = from_hex('fb') --sell
                        or bytearray_substring (data, 1, 8) = from_hex('634609a43879ca22') --sell v2
                    then 
                            BYTEARRAY_TO_BIGINT (BYTEARRAY_REVERSE (BYTEARRAY_SUBSTRING (data, 1 + 16, 8))) / 1e6
                end as volume
            from solana.instruction_calls
            where block_time >= from_unixtime(${options.fromTimestamp})
                and block_time< from_unixtime(${options.toTimestamp})
                and executing_account = '3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp'
            and (bytearray_substring (data, 1, 1) = from_hex('fb')
                or bytearray_substring (data, 1, 1) = from_hex('b3')
                or bytearray_substring (data, 1, 8) = from_hex('850b5e1c096fe5d1')
                or bytearray_substring (data, 1, 8) = from_hex('634609a43879ca22'))
            and tx_success
            and cardinality(log_messages) > 10
        )
        select
            sum(volume) as total_volume,
            sum(fees) as total_fees
        from trade_data
    `;

    if (options.startOfDay >= JUPITER_STATS_API_START_TS) await assertJupiterStatsPublished(options);
    const queryResult = await queryDuneSql(options, query);

    if (!queryResult[0] || !queryResult[0].total_volume || !queryResult[0].total_fees)
        throw new Error('Jupiter prediction dune data not found');

    const volume = queryResult[0].total_volume;
    const fees = queryResult[0].total_fees;
    
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
  
    dailyVolume.addUSDValue(volume);
    dailyFees.addUSDValue(fees, JUPITER_METRICS.JupPredictionFees);
    dailySupplySideRevenue.addUSDValue(fees, JUPITER_METRICS.JupPredictionFeesToKalshi);

    // From 2026-01-01, fees and revenue from Jupiter's stats API, including Arcade.
    if (options.startOfDay >= JUPITER_STATS_API_START_TS) {
        const api = await getJupiterStatsRevenue(options, {
            prediction: {
                fees: JUPITER_METRICS.JupPredictionFees,
                revenue: JUPITER_METRICS.JupPredictionFeesToJupiter,
                supplySide: JUPITER_METRICS.JupPredictionFeesToVenues,
            },
        });
        return {
            dailyVolume,
            dailyFees: api.dailyFees,
            dailyRevenue: api.dailyRevenue,
            dailyProtocolRevenue: api.dailyRevenue.clone(1),
            dailyHoldersRevenue: 0,
            dailySupplySideRevenue: api.dailySupplySideRevenue,
        }
    }

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: 0,
        dailyHoldersRevenue: 0,
        dailyProtocolRevenue: 0,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Volume: 'Volume of all trades through jupiter interface',
    Fees: 'Fees paid by users on prediction trades. From 2026-01-01, prediction and Arcade fees from Jupiter\'s stats API.',
    Revenue: 'Before 2026-01-01, none is counted. From 2026-01-01, the fees Jupiter keeps, from Jupiter\'s stats API.',
    SupplySideRevenue: 'Before 2026-01-01, all fees to Kalshi. From 2026-01-01, the venue\'s share of fees (Kalshi or Polymarket).',
    HoldersRevenue: 'No holders revenue',
    ProtocolRevenue: 'From 2026-01-01, all revenue goes to Jupiter.',
}

const breakdownMethodology = {
    Fees: {
      [JUPITER_METRICS.JupPredictionFees]: 'Fees paid by users on prediction trades, and from 2026-01-01 on Arcade.',
    },
    Revenue: {
      [JUPITER_METRICS.JupPredictionFeesToJupiter]: 'From 2026-01-01, prediction and Arcade fees kept by Jupiter.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupPredictionFeesToJupiter]: 'From 2026-01-01, prediction and Arcade fees kept by Jupiter.',
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupPredictionFeesToKalshi]: 'Before 2026-01-01, all fees go to Kalshi.',
      [JUPITER_METRICS.JupPredictionFeesToVenues]: 'From 2026-01-01, the venue\'s share of prediction fees.',
    },
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    start: '2025-10-21',
    chains: [CHAIN.SOLANA],
    methodology,
    isExpensiveAdapter: true,
    doublecounted: true,
    allowNegativeValue: true, // the venue's share is measured from its settlements, which can fall on a different day from the fees
    dependencies: [Dependencies.DUNE],
    breakdownMethodology
}

export default adapter;