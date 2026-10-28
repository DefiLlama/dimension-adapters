import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURLAutoHandleRateLimit from "../../utils/fetchURL";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const FEE_TYPES = ["quadratic", "quadratic_with_maker_fees"];
type FeeType = (typeof FEE_TYPES)[number];

interface FeeData {
    feeMultiplier: number;
    feeType: FeeType
}

const KALSHI_API_BASE_URL = 'https://external-api.kalshi.com';
const KALSHI_V1_API_BASE_URL = 'https://api.elections.kalshi.com/v1';
const USD_IN_CENTI_CENTS = 100 * 100;
const STANDARD_FEE_MULTIPLIER = 0.07;
const MAKER_FEE_MULTIPLIER = 0.25;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

const fetchNonStandardFee = async () => {
    let cursor = null;

    const tickerToFee = new Map<string, FeeData>();

    do {
        const apiResponse = await fetchURLAutoHandleRateLimit(`${KALSHI_V1_API_BASE_URL}/search/series?fee_types=nonstandard${cursor ? `&cursor=${cursor}` : ''}`);
        const seriesData = apiResponse.current_page;
        cursor = apiResponse.next_cursor;

        for (const series of seriesData) {
            const { fee_type, fee_multiplier, markets } = series;
            if (!FEE_TYPES.includes(fee_type)) {
                throw new Error(`Unknown fee type for series ${series.series_ticker}: ${fee_type}`);
            }
            for (const market of markets) {
                tickerToFee.set(market.ticker, {
                    feeMultiplier: fee_multiplier,
                    feeType: fee_type,
                });
            }
        }
    }
    while (cursor);

    return tickerToFee;
}

const fetchTradingFees = async (options: FetchOptions, tickerToFee: Map<string, FeeData>) => {
    const limit = 1000;
    let cursor = null;
    let takerFees = 0;
    let makerFees = 0;

    const addFees = (trade: any) => {
        const { count_fp, no_price_dollars, yes_price_dollars, taker_book_side, taker_outcome_side, ticker } = trade;
        const takerSide = ((taker_book_side === 'bid' && taker_outcome_side === 'yes') || (taker_book_side === 'ask' && taker_outcome_side === 'no')) ? 'yes' : 'no';

        let takerVolume = 0, makerVolume = 0;
        let takerTradePrice = 0, makerTradePrice = 0;

        if (takerSide === 'yes') {
            takerVolume = Number(yes_price_dollars) * Number(count_fp);
            makerVolume = Number(no_price_dollars) * Number(count_fp);
            takerTradePrice = Number(yes_price_dollars);
            makerTradePrice = Number(no_price_dollars);
        }
        else {
            takerVolume = Number(no_price_dollars) * Number(count_fp);
            makerVolume = Number(yes_price_dollars) * Number(count_fp);
            takerTradePrice = Number(no_price_dollars);
            makerTradePrice = Number(yes_price_dollars);
        }

        const feeData = tickerToFee.get(ticker);
        const feeMultiplier = feeData?.feeMultiplier ?? 1;
        const feeType = feeData?.feeType ?? 'quadratic';

        const takerFeeForTrade = Math.round(takerVolume * feeMultiplier * (1 - takerTradePrice) * STANDARD_FEE_MULTIPLIER * 100) / 100;
        const makerFeeForTrade = Math.round(makerVolume * feeMultiplier * (1 - makerTradePrice) * STANDARD_FEE_MULTIPLIER * MAKER_FEE_MULTIPLIER * 100) / 100;

        takerFees += takerFeeForTrade;
        if (feeType === 'quadratic_with_maker_fees') {
            makerFees += makerFeeForTrade;
        }
    }

    const cutoffData = await fetchURL(`${KALSHI_API_BASE_URL}/trade-api/v2/historical/cutoff`)
    const { orders_updated_ts } = cutoffData;
    const ordersUpdatedDate = orders_updated_ts.split('T')[0];

    const dataType = options.dateString >= ordersUpdatedDate ? 'markets' : 'historical';

    do {
        const apiResponse = await fetchURLAutoHandleRateLimit(`${KALSHI_API_BASE_URL}/trade-api/v2/${dataType}/trades?limit=${limit}&min_ts=${options.fromTimestamp}&max_ts=${options.toTimestamp}${cursor ? `&cursor=${cursor}` : ''}`);
        const trades = apiResponse.trades;
        cursor = apiResponse.cursor;

        for (const trade of trades) {
            addFees(trade)
        }
    }
    while (cursor);

    return {
        takerFees,
        makerFees,
    }
}

const fetchIncentives = async (options: FetchOptions) => {
    const limit = 10_000;
    let cursor = null;
    let liquidityIncentives = 0;
    let volumeIncentives = 0;

    const getIncentiveForCurrentPeriod = (start_date: string, end_date: string, period_reward: number) => {
        const periodStart = new Date(start_date).getTime() / 1000;
        const periodEnd = new Date(end_date).getTime() / 1000;

        const totalDuration = periodEnd - periodStart;
        if (totalDuration <= 0) return 0;

        const rewardPerSecond = period_reward / totalDuration;

        const from = Math.max(options.fromTimestamp, periodStart);
        const to = Math.min(options.toTimestamp, periodEnd);

        const elapsed = Math.max(0, to - from);
        return elapsed * rewardPerSecond;
    }

    do {
        const apiResponse = await fetchURLAutoHandleRateLimit(`https://external-api.kalshi.com/trade-api/v2/incentive_programs?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
        const incentivePrograms = apiResponse.incentive_programs;
        cursor = apiResponse.next_cursor;

        for (const incentiveProgram of incentivePrograms) {
            const { start_date, end_date, incentive_type, period_reward } = incentiveProgram;
            const incentiveForCurrentPeriodInCentiCents = getIncentiveForCurrentPeriod(start_date, end_date, period_reward);
            const incentiveForCurrentPeriodInUSD = incentiveForCurrentPeriodInCentiCents / USD_IN_CENTI_CENTS;
            if (incentive_type === 'liquidity') {
                liquidityIncentives += incentiveForCurrentPeriodInUSD;
            } else if (incentive_type === 'volume') {
                volumeIncentives += incentiveForCurrentPeriodInUSD;
            }
            else {
                throw new Error(`Unknown incentive type: ${incentive_type}`);
            }
        }
    }
    while (cursor);

    return {
        liquidityIncentives,
        volumeIncentives,
    }
}

const fetchHoldingInterestsPaid = async (options: FetchOptions) => {
    const previousDay = new Date(options.dateString).getTime() - 24 * 60 * 60 * 1000;
    const previousDayString = new Date(previousDay).toISOString().split('T')[0];

    const getAnnualInterestRate = () => {
        if (previousDayString <= '2025-08-13')
            return 4.05
        else if (previousDayString > '2025-08-13' && previousDayString <= '2025-10-01')
            return 4
        else if (previousDayString > '2025-10-01' && previousDayString <= '2026-03-01')
            return 3.75
        else return 3.25
    }

    const openInterestQuery = `
        SELECT 
            SUM(CASE WHEN status = 'active' THEN open_interest ELSE 0 END) AS open_interest
        FROM 
            kalshi.market_report
        WHERE 
            date = '${previousDayString}'
    `;
    const openInterest = await queryDuneSql(options, openInterestQuery);
    const interestDistributed = openInterest[0].open_interest * getAnnualInterestRate() / 100 * (options.toTimestamp - options.fromTimestamp) / ONE_YEAR_IN_SECONDS;

    return interestDistributed;
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const tickerToFee = await fetchNonStandardFee();
    const { takerFees, makerFees } = await fetchTradingFees(options, tickerToFee);
    dailyFees.addUSDValue(takerFees, "Taker Fees");
    dailyFees.addUSDValue(makerFees, "Maker Fees");

    const { liquidityIncentives, volumeIncentives } = await fetchIncentives(options);
    dailySupplySideRevenue.addUSDValue(liquidityIncentives, "Liquidity Incentives");
    dailySupplySideRevenue.addUSDValue(volumeIncentives, "Volume Incentives");

    const holdingInterestDistributed = await fetchHoldingInterestsPaid(options);
    dailySupplySideRevenue.addUSDValue(holdingInterestDistributed, "Interest paid on open positions");

    const revenue = takerFees + makerFees - liquidityIncentives - volumeIncentives - holdingInterestDistributed;
    dailyRevenue.addUSDValue(revenue, "Trading Fees to protocol");

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "Trading fees collected by the platform",
    Revenue: "Fees retained by the platform after distributing incentives and interest to traders",
    ProtocolRevenue: "Fees retained by the platform after distributing incentives and interest to traders",
    SupplySideRevenue: "Incentives and interest paid to traders"
}

const breakdownMethodology = {
    Fees: {
        "Taker Fees": "Fees paid by takers",
        "Maker Fees": "Fees paid by makers",
    },
    Revenue: {
        "Trading Fees to protocol": "Fees retained by the platform after distributing incentives and interest to traders",
    },
    ProtocolRevenue: {
        "Trading Fees to protocol": "Fees retained by the platform after distributing incentives and interest to traders",
    },
    SupplySideRevenue: {
        "Liquidity Incentives": "Incentives paid to traders for providing liquidity",
        "Volume Incentives": "Incentives paid to traders for trading volume",
        "Interest paid on open positions": "Interest paid to traders for holding open positions",
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    methodology,
    allowNegativeValue: true,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    breakdownMethodology,
    start: '2021-07-01',
}

export default adapter;