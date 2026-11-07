import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { JUPITER_METRICS, JUP_TREASURY_SHARE } from "../../fees/jupiter";
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

    const useStatsApi = options.startOfDay >= JUPITER_STATS_API_START_TS;
    if (useStatsApi) await assertJupiterStatsPublished(options);
    const queryResult = await queryDuneSql(options, query);

    if (!queryResult[0] || !queryResult[0].total_volume || !queryResult[0].total_fees)
        throw new Error('Jupiter prediction dune data not found');

    const volume = queryResult[0].total_volume;
    const fees = queryResult[0].total_fees;

    // Jupiter's share of the fees is not visible onchain: from 2026-01-01 it comes from Jupiter's stats API, before that none is counted.
    // The API's prediction total also includes Arcade.
    const revenue = useStatsApi
        ? await (await getJupiterStatsRevenue(options, { prediction: JUPITER_METRICS.JupPredictionFeesToJupiter })).dailyRevenue.getUSDValue()
        : 0;

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyVolume.addUSDValue(volume);
    dailyFees.addUSDValue(fees, JUPITER_METRICS.JupPredictionFees);
    dailyRevenue.addUSDValue(revenue, JUPITER_METRICS.JupPredictionFeesToJupiter);
    dailySupplySideRevenue.addUSDValue(fees - revenue, JUPITER_METRICS.JupPredictionFeesToVenues);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(JUP_TREASURY_SHARE),
        dailySupplySideRevenue,
    }
}

const methodology = {
    Volume: 'USDC value of prediction market buys and sells through Jupiter.',
    Fees: 'Trading fees paid by users on prediction market buys and sells through Jupiter.',
    Revenue: "Jupiter's share of prediction fees, counted from 2026-01-01.",
    ProtocolRevenue: "Half of Jupiter's share, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
    SupplySideRevenue: "Prediction fees paid to the market venues (Kalshi, Polymarket) after Jupiter's share.",
}

const breakdownMethodology = {
    Fees: {
      [JUPITER_METRICS.JupPredictionFees]: 'Trading fees paid by users on prediction market buys and sells.',
    },
    Revenue: {
      [JUPITER_METRICS.JupPredictionFeesToJupiter]: "Jupiter's share of prediction fees, since 2026-01-01.",
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupPredictionFeesToJupiter]: "Half of Jupiter's share of prediction fees, kept by the treasury.",
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupPredictionFeesToVenues]: "Prediction fees paid to the market venues after Jupiter's share.",
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
    allowNegativeValue: true, // Jupiter's share in the stats API follows venue settlements, so a day's share can exceed that day's fees
    dependencies: [Dependencies.DUNE],
    breakdownMethodology
}

export default adapter;