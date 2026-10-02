import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const BASE_URL = "https://www.polymarketexchange.com/files/time-and-sales";
const VOLUME_THRESHOLD = 500_000_000;

// combo instruments trade under caoc- symbols (https://docs.polymarket.us/api-reference/combos/overview)
const isCombo = (symbol: string) => symbol.startsWith('caoc-');

interface Trade {
    transactionTime: number;
    symbol: string;
    lastPrice: number;
    lastQuantity: number;
}

const fileName = (date: string) => `${date.replaceAll('-', '')}-time-and-sales.csv`;

// fee schedule changes are effective at ET times (https://docs.polymarket.us/fees)
const FEES_START = Date.parse('2026-01-08T17:00:00-05:00');            // flat 1% taker fee
const THETA_005_START = Date.parse('2026-04-03T17:00:00-04:00');       // Θ = 0.05
const THETA_006_START = Date.parse('2026-07-01T00:00:00-04:00');       // 12:00 AM ET Jul 1: Θ = 0.06
const THETA_00695_START = Date.parse('2026-09-16T23:59:00-04:00');     // 11:59 PM ET Sep 16: Θ = 0.0695
const COMBO_CURVE_START = Date.parse('2026-09-24T23:59:00-04:00');     // 11:59 PM ET Sep 24: combos move to their own curve
const COMBO_THETA_006_START = Date.parse('2026-10-01T10:00:00-04:00'); // 10:00 AM ET Oct 1: combo second coefficient 0.04 -> 0.06

// Combo taker fee = C × p × [Θ × (1 - p) + comboTheta × (1 - p)^4]
function comboFee(trade: Trade, takerTheta: number) {
    const comboTheta = trade.transactionTime < COMBO_THETA_006_START ? 0.04 : 0.06;
    return Math.round(trade.lastQuantity * trade.lastPrice * (takerTheta * (1 - trade.lastPrice) + comboTheta * (1 - trade.lastPrice) ** 4) * 100) / 100;
}

function parseTradeCSV(csv: string, fileDate: string, fromMs: number, toMs: number, repeats = new Map<string, number>()) {
    const lines = csv.trim().split('\n');
    const trades: Trade[] = [];
    const early = new Map<string, number>();

    const prevDate = new Date(Date.parse(`${fileDate}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
    const open = `${prevDate}T17:00:00`;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const repeat = repeats.get(line);
        if (repeat) {
            repeats.set(line, repeat - 1);
            continue;
        }
        const [time, symbol, price, quantity] = line.split(',');
        const transactionTime = Date.parse(time);
        if (isNaN(transactionTime)) throw new Error(`Invalid transaction time ${time} in ${fileName(fileDate)}`);
        if (transactionTime < fromMs || transactionTime >= toMs) continue;
        if (time < open) early.set(line, (early.get(line) ?? 0) + 1);
        trades.push({
            transactionTime,
            symbol,
            lastPrice: parseFloat(price),
            lastQuantity: parseFloat(quantity),
        });
    }

    return { trades, early };
}

async function fetch(options: FetchOptions) {

    const fromMs = options.startOfDay * 1000;
    const toMs = options.endTimestamp * 1000;
    const fileDates = [options.dateString, new Date(toMs).toISOString().slice(0, 10)];

    // the next day's file is only published after its 17:00 ET close, so the latest UTC day throws until then
    const manifestData = await fetchURL(`${BASE_URL}/manifest.json`);
    for (const fileDate of fileDates) {
        if (!manifestData.files.some((item: any) => item.filename === fileName(fileDate))) {
            throw new Error(`No data found for ${fileDate}`);
        }
    }

    const [dayFile, nextFile] = fileDates;
    const next = parseTradeCSV(await fetchURL(`${BASE_URL}/${fileName(nextFile)}`), nextFile, fromMs, toMs);
    const day = parseTradeCSV(await fetchURL(`${BASE_URL}/${fileName(dayFile)}`), dayFile, fromMs, toMs, next.early);
    const tradesData = day.trades.concat(next.trades);

    const dailyVolume = options.createBalances();
    const dailyNotionalVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyRevenue = options.createBalances();

    for (const trade of tradesData) {
        dailyVolume.addUSDValue(trade.lastQuantity * trade.lastPrice);
        dailyNotionalVolume.addUSDValue(trade.lastQuantity);

        let fee = 0;
        const time = trade.transactionTime;

        if (time < FEES_START) {
            // no fees
        }
        else if (time < THETA_005_START) {
            fee = Math.round(trade.lastQuantity * trade.lastPrice * 0.01 * 100) / 100;
            dailyFees.addUSDValue(fee, 'Taker Fees');
            dailyRevenue.addUSDValue(fee, 'Protocol Revenue');
        }
        else if (time < THETA_006_START) {
            // Fee = 0.05 × C × p × (1 - p), effective from 2026-04-04
            const takerTheta = 0.05;
            fee = Math.round(takerTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            dailyFees.addUSDValue(fee, 'Taker Fees');
            dailySupplySideRevenue.addUSDValue(fee * 0.25, 'Maker Rebates');
            dailySupplySideRevenue.addUSDValue(fee * 0.5, 'Taker Rebates');
            dailyRevenue.addUSDValue(fee * 0.25, 'Protocol Revenue');
        }
        else if (time < THETA_00695_START) {
            const takerTheta = 0.06;
            const makerRebateTheta = 0.0125;
            fee = Math.round(takerTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            const makerRebate = Math.round(makerRebateTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            const protocolRevenue = fee - makerRebate;
            dailyFees.addUSDValue(fee, isCombo(trade.symbol) ? 'Combo Taker Fees' : 'Taker Fees');
            dailySupplySideRevenue.addUSDValue(makerRebate, 'Maker Rebates');
            dailyRevenue.addUSDValue(protocolRevenue, 'Protocol Revenue');
        }
        else {
          const takerTheta = 0.0695;
          if (isCombo(trade.symbol) && time >= COMBO_CURVE_START) {
            fee = comboFee(trade, takerTheta);
            dailyFees.addUSDValue(fee, 'Combo Taker Fees');
          } else {
            fee = Math.round(takerTheta * trade.lastQuantity * trade.lastPrice * (1 - trade.lastPrice) * 100) / 100;
            dailyFees.addUSDValue(fee, isCombo(trade.symbol) ? 'Combo Taker Fees' : 'Taker Fees');
          }
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
    Volume: 'The total volume of trades on Polymarket US per UTC day, taken from the exchange\'s daily time-and-sales files (17:00 ET to 17:00 ET trading days) and filtered by trade time',
    NotionalVolume: 'The total notional volume of trades on Polymarket US per UTC day, taken from the exchange\'s daily time-and-sales files (17:00 ET to 17:00 ET trading days) and filtered by trade time',
    Fees: 'Taker fees computed as Θ × C × p × (1 - p), where C is contracts and p is trade price. Θ = 0.0695 from 11:59 PM ET 2026-09-16, Θ = 0.06 from 12:00 AM ET 2026-07-01, Θ = 0.05 from 2026-04-04, flat 1% from 2026-01-09 to 2026-04-03. Combo trades (launched 2026-08-11) use the same formula until 11:59 PM ET 2026-09-24, then pay C × p × [Θ × (1 - p) + 0.04 × (1 - p)^4], with 0.04 raised to 0.06 from 10:00 AM ET 2026-10-01. Revenue breakdowns are not available due to lack of per-trader volume data.',
    UserFees: 'Taker fees computed as Θ × C × p × (1 - p), where C is contracts and p is trade price. Θ = 0.0695 from 11:59 PM ET 2026-09-16, Θ = 0.06 from 12:00 AM ET 2026-07-01, Θ = 0.05 from 2026-04-04, flat 1% from 2026-01-09 to 2026-04-03. Combo trades (launched 2026-08-11) use the same formula until 11:59 PM ET 2026-09-24, then pay C × p × [Θ × (1 - p) + 0.04 × (1 - p)^4], with 0.04 raised to 0.06 from 10:00 AM ET 2026-10-01. Revenue breakdowns are not available due to lack of per-trader volume data.',
    // Revenue: 'Protocol revenue after maker rebates are distributed at trade time. Volume-tier taker rebates (paid weekly) are not deducted.',
    // ProtocolRevenue: 'Net taker fees retained by the protocol after maker rebates (Θ = 0.0475 × C × p × (1 - p) from 2026-07-01)',
    // SupplySideRevenue: 'Maker rebates credited at trade time (Θ = 0.0125 × C × p × (1 - p) from 2026-07-01). Volume-tier taker rebates are excluded.',
}

const breakdownMethodology = {
    Fees: {
        'Taker Fees': 'Fees paid by the aggressor on each trade, computed as Θ × C × p × (1 - p)',
        'Combo Taker Fees': 'Fees paid by the aggressor on each combo trade since combos launched on 2026-08-11, computed on the combo execution price as Θ × C × p × (1 - p) until 11:59 PM ET 2026-09-24, then C × p × [Θ × (1 - p) + 0.04 × (1 - p)^4], with 0.04 raised to 0.06 from 10:00 AM ET 2026-10-01',
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
