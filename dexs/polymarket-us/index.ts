import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BASE_URL = "https://www.polymarketexchange.com/files/time-and-sales";
const VOLUME_THRESHOLD = 500_000_000;

interface Trade {
    transactionTime: Date;
    symbol: string;
    lastPrice: number;
    lastQuantity: number;
}

function parseTradeCSV(csv: string): Trade[] {
    const lines = csv.trim().split('\n');
    const trades: Trade[] = [];

    for (let i = 1; i < lines.length; i++) {
        const [time, symbol, price, quantity] = lines[i].split(',');
        trades.push({
            transactionTime: new Date(time),
            symbol,
            lastPrice: parseFloat(price),
            lastQuantity: parseFloat(quantity),
        });
    }

    return trades;
}

async function fetch(options: FetchOptions) {

    const manifestData = await fetchURL(`${BASE_URL}/manifest.json`);
    const todaysData = manifestData.files.find((item: any) => item.filename === `${options.dateString.replaceAll('-', '')}-time-and-sales.csv`);

    if (!todaysData) {
        throw new Error(`No data found for ${options.dateString}`);
    }

    const csvResponse = await fetchURL(`${BASE_URL}/${todaysData.filename}`);
    const tradesData = parseTradeCSV(csvResponse);

    const dailyVolume = options.createBalances();
    const dailyNotionalVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    for (const trade of tradesData) {
        dailyVolume.addUSDValue(trade.lastQuantity * trade.lastPrice);
        dailyNotionalVolume.addUSDValue(trade.lastQuantity);

        let fee = 0;

        if (options.dateString < '2026-01-09') {
            // no fees
        }
        else if (options.dateString <= '2026-04-03') {
            fee = Math.round(trade.lastQuantity * trade.lastPrice * 0.01 * 100) / 100;
            dailyFees.addUSDValue(fee, 'Taker Fees');
            dailyRevenue.addUSDValue(fee, 'Protocol Revenue');
        }
        else if (options.dateString < '2026-07-01') {
            // Fee = 0.05 × C × p × (1 - p), effective from 2026-04-04
            const takerTheta = 0.05;
            fee = Math.round(takerTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            dailyFees.addUSDValue(fee, 'Taker Fees');
            dailySupplySideRevenue.addUSDValue(fee * 0.25, 'Maker Rebates');
            dailySupplySideRevenue.addUSDValue(fee * 0.5, 'Taker Rebates');
            dailyRevenue.addUSDValue(fee * 0.25, 'Protocol Revenue');
        }
        else {
            // Fee = 0.06 × C × p × (1 - p), effective from 2026-07-01
            const takerTheta = 0.06;
            const makerRebateTheta = 0.0125;
            fee = Math.round(takerTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            const makerRebate = Math.round(makerRebateTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            const protocolRevenue = fee - makerRebate;
            dailyFees.addUSDValue(fee, 'Taker Fees');
            dailySupplySideRevenue.addUSDValue(makerRebate, 'Maker Rebates');
            dailyRevenue.addUSDValue(protocolRevenue, 'Protocol Revenue');
        }
    }

    const volumeInUsd = await dailyVolume.getUSDValue();
    if(volumeInUsd > VOLUME_THRESHOLD) {
      throw new Error('Inflated Volumes, cant be verified')
    }

    return {
        dailyVolume,
        dailyNotionalVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        // dailyRevenue,
        // dailyProtocolRevenue: dailyRevenue,
        // dailySupplySideRevenue,
    };
}

const methodology = {
    Volume: 'The total volume of trades on Polymarket US',
    NotionalVolume: 'The total notional volume of trades on Polymarket US',
    Fees: 'Taker fees computed as Θ × C × p × (1 - p), where C is contracts and p is trade price. Θ = 0.06 from 2026-07-01, Θ = 0.05 from 2026-04-04, flat 1% from 2026-01-09 to 2026-04-03. Revenue breakdowns are not available due to lack of per-trader volume data.',
    UserFees: 'Taker fees computed as Θ × C × p × (1 - p), where C is contracts and p is trade price. Θ = 0.06 from 2026-07-01, Θ = 0.05 from 2026-04-04, flat 1% from 2026-01-09 to 2026-04-03. Revenue breakdowns are not available due to lack of per-trader volume data.',
    // Revenue: 'Protocol revenue after maker rebates are distributed at trade time. Volume-tier taker rebates (paid weekly) are not deducted.',
    // ProtocolRevenue: 'Net taker fees retained by the protocol after maker rebates (Θ = 0.0475 × C × p × (1 - p) from 2026-07-01)',
    // SupplySideRevenue: 'Maker rebates credited at trade time (Θ = 0.0125 × C × p × (1 - p) from 2026-07-01). Volume-tier taker rebates are excluded.',
}

const breakdownMethodology = {
    Fees: {
        'Taker Fees': 'Fees paid by the aggressor on each trade, computed as Θ × C × p × (1 - p)',
    },
    // Revenue: {
    //     'Protocol Revenue': 'Taker fees retained by the protocol after maker rebates at trade time',
    // },
    // SupplySideRevenue: {
    //     'Maker Rebates': 'Rebates credited to resting order makers at trade time (Θ = 0.0125 × C × p × (1 - p) from 2026-07-01)',
    //     'Taker Rebates': 'Volume-tier taker rebates paid weekly to high-volume traders (estimated for pre-2026-07-01 period only)',
    // },
}

const adapter: SimpleAdapter = {
    fetch,
    start: "2025-10-30",
    chains: [CHAIN.OFF_CHAIN],
    methodology,
    breakdownMethodology,
    skipBreakdownValidation: true,
}

export default adapter;
