import { getEventLogs } from "@defillama/sdk";
import { ethers } from "ethers";
import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneResult, queryDuneSql } from "../../helpers/dune";
import { JUPITER_METRICS } from "../../fees/jupiter";
import { assertJupiterStatsPublished, getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../../helpers/jupiter-stats";

const ARCADE_FEES = 'Jupiter Arcade Fees';
// Arcade runs on the Play program 2DeGBCAiEJd1MgMuPGDKh7svBikZa9izbnTn5p7ESzPt: it keeps 1% of winnings and sweeps it to
// the treasury USDC account in its PlayConfig, which only receives swept fees. First fees on 2026-05-25.
const ARCADE_TREASURY = 'ABMPgzzP8dLrzLVc8PZb2MTLadQCmTTsxNVsQHKrJx6r';
const ARCADE_START_TS = 1779667200; // 2026-05-25
// Saved Dune query running helpers/queries/jupiter-prediction.sql: the same fills per day since 2025-10-21, so refills
// skip the daily query below. Rerun it on Dune to extend the history; days not in its result use the daily query.
const DUNE_HISTORY_QUERY_ID = '9088797';
// Combos are funded on Solana and bought by Jupiter's Polymarket wallet on Polygon, with no Predict program call, so the
// fills above miss them. Read from the OrderFilled events of Polymarket's Combos exchange (same contract and event as
// dexs/polymarket-combos) whose order maker is that wallet. Amounts are pUSD, Polymarket's USDC-backed collateral, 6 decimals.
// First fills on 2026-10-20.
const COMBOS_FEES = 'Jup Prediction Combos Fees';
const COMBOS_EXCHANGE = '0xe3333700cA9d93003F00f0F71f8515005F6c00Aa';
const COMBOS_ORDER_FILLED = 'event OrderFilled (bytes32 indexed orderHash, address indexed maker, address indexed taker, uint8 side, uint256 tokenId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, bytes32 builder, bytes32 metadata)';
const COMBOS_ORDER_FILLED_TOPIC = '0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee';
const COMBOS_WALLET = '0x5b6331e7Ff0831a3FE2eD12004747db1a9c911A4';
const COMBO_POSITION_TOKEN_PREFIX = 3n; // top byte of a Combos position token id
const COMBOS_START_TS = 1792454400; // 2026-10-20

async function fetchCombos(options: FetchOptions): Promise<{ volume: number, fees: number }> {
    if (options.startOfDay < COMBOS_START_TS) return { volume: 0, fees: 0 };
    const [fromBlock, toBlock] = await Promise.all([
        options.getBlock(options.fromTimestamp - 1, CHAIN.POLYGON, {}).then((block) => block + 1),
        options.getBlock(options.toTimestamp, CHAIN.POLYGON, {}),
    ]);
    const logs = await getEventLogs({
        chain: CHAIN.POLYGON,
        target: COMBOS_EXCHANGE,
        eventAbi: COMBOS_ORDER_FILLED,
        topics: [COMBOS_ORDER_FILLED_TOPIC, null, ethers.zeroPadValue(COMBOS_WALLET, 32)] as any,
        fromBlock,
        toBlock,
        onlyArgs: true,
    });

    let volume = 0n;
    let fees = 0n;
    for (const log of logs) {
        if ((BigInt(log.tokenId) >> 248n) !== COMBO_POSITION_TOKEN_PREFIX) continue;
        // a buy pays makerAmountFilled pUSD, a sell receives takerAmountFilled pUSD
        volume += BigInt(Number(log.side) === 0 ? log.makerAmountFilled : log.takerAmountFilled);
        fees += BigInt(log.fee);
    }
    return { volume: Number(volume) / 1e6, fees: Number(fees) / 1e6 };
}

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
            sum(fees) as total_fees,
            ${options.startOfDay >= ARCADE_START_TS ? `(
                select coalesce(sum(amount), 0) / 1e6
                from tokens_solana.transfers
                where block_time >= from_unixtime(${options.fromTimestamp})
                    and block_time < from_unixtime(${options.toTimestamp})
                    and to_token_account = '${ARCADE_TREASURY}'
                    and token_mint_address = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
            )` : '0'} as arcade_fees
        from trade_data
    `;

    const useStatsApi = options.startOfDay >= JUPITER_STATS_API_START_TS;
    if (useStatsApi) await assertJupiterStatsPublished(options);
    const cached = await queryDuneResult(options, DUNE_HISTORY_QUERY_ID, `day = '${options.dateString}'`);
    const queryResult = cached.length ? cached : await queryDuneSql(options, query);

    if (!queryResult[0] || !queryResult[0].total_volume || !queryResult[0].total_fees)
        throw new Error('Jupiter prediction dune data not found');

    const volume = queryResult[0].total_volume;

    // a saved result from before Arcade was added has no arcade_fees column: rerun the saved query
    if (!('arcade_fees' in queryResult[0])) throw new Error('Jupiter prediction: saved Dune result has no arcade_fees, rerun it');
    const arcadeFees = Number(queryResult[0].arcade_fees);
    const predictionFees = queryResult[0].total_fees;
    const combos = await fetchCombos(options);
    const fees = predictionFees + arcadeFees + combos.fees;

    // Jupiter's share of the fees is not visible onchain: from 2026-01-01 it comes from Jupiter's stats API, before that none is counted.
    // The API's prediction total includes Arcade, which is counted in fees above.
    const revenue = useStatsApi
        ? await (await getJupiterStatsRevenue(options, { prediction: JUPITER_METRICS.JupPredictionFeesToJupiter })).dailyRevenue.getUSDValue()
        : 0;

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyVolume.addUSDValue(volume + combos.volume);
    dailyFees.addUSDValue(predictionFees, JUPITER_METRICS.JupPredictionFees);
    dailyFees.addUSDValue(arcadeFees, ARCADE_FEES);
    dailyFees.addUSDValue(combos.fees, COMBOS_FEES);
    dailyRevenue.addUSDValue(revenue, JUPITER_METRICS.JupPredictionFeesToJupiter);
    dailySupplySideRevenue.addUSDValue(fees - revenue, JUPITER_METRICS.JupPredictionFeesToVenues);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Volume: 'USDC value of prediction market buys and sells through Jupiter, including Combos bought on Polygon from 2026-10-20.',
    Fees: 'Trading fees paid by users on prediction market buys and sells through Jupiter, including Combos, plus the 1% Arcade fee on winnings.',
    Revenue: "Jupiter's share of prediction fees, counted from 2026-01-01.",
    ProtocolRevenue: "All of Jupiter's share, kept by Jupiter. Not used for JUP buybacks.",
    SupplySideRevenue: "Prediction fees paid to the market venues (Kalshi, Polymarket) after Jupiter's share.",
}

const breakdownMethodology = {
    Fees: {
      [JUPITER_METRICS.JupPredictionFees]: 'Trading fees paid by users on prediction market buys and sells.',
      [ARCADE_FEES]: 'The 1% Arcade fee on winnings, swept to the Arcade treasury.',
      [COMBOS_FEES]: "Fees on Combos, bought by Jupiter's Polymarket wallet on Polygon, from 2026-10-20.",
    },
    Revenue: {
      [JUPITER_METRICS.JupPredictionFeesToJupiter]: "Jupiter's share of prediction fees, since 2026-01-01.",
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupPredictionFeesToJupiter]: "All of Jupiter's share of prediction fees, kept by Jupiter.",
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
