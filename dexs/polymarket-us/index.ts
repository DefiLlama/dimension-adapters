// Changes to this adapter's revenue methodology require further approval before merging:
// a Trueo market depends on this data.

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import axios from "axios";

const BASE_URL = "https://www.polymarketexchange.com/files/time-and-sales";
const VOLUME_THRESHOLD = 500_000_000;

// combo instruments trade under caoc- symbols, combos created from 2026-10-15 under crossd- (https://docs.polymarket.us/api-reference/combos/overview)
const isCombo = (symbol: string) => symbol.startsWith('caoc-') || symbol.startsWith('crossd-');

// market symbols carry the league slug as their second segment, e.g. aec-setkameua-...
const leagueOf = (symbol: string) => symbol.split('-')[1];

// Table Tennis league slugs, read from the exchange's sports API
async function getTableTennisLeagues(): Promise<Set<string>> {
    const { sport } = await fetchURL('https://gateway.polymarket.us/v2/sports/table-tennis');
    const leagues: string[] = (sport?.leagues ?? []).map((league: any) => league.slug).filter(Boolean);
    if (!leagues.length) throw new Error('No Table Tennis leagues returned by the Polymarket US sports API');
    return new Set(leagues);
}

interface Trade {
    transactionTime: number;
    symbol: string;
    lastPrice: number;
    lastQuantity: number;
}

const fileName = (date: string) => `${date.replaceAll('-', '')}-time-and-sales.csv`;

// fee schedule changes are effective at ET times (https://docs.polymarket.us/fees,
// past versions of the page: https://github.com/justrhoto/polymarket-us-docs/commits/main/docs/fees.md)
const FEES_START = Date.parse('2026-01-08T17:00:00-05:00');            // flat 1% taker fee
const THETA_005_START = Date.parse('2026-04-03T17:00:00-04:00');       // Θ = 0.05
const THETA_006_START = Date.parse('2026-07-01T00:00:00-04:00');       // 12:00 AM ET Jul 1: Θ = 0.06
const THETA_00695_START = Date.parse('2026-09-16T23:59:00-04:00');     // 11:59 PM ET Sep 16: Θ = 0.0695
const COMBO_CURVE_START = Date.parse('2026-09-24T23:59:00-04:00');     // 11:59 PM ET Sep 24: combos move to their own curve
const COMBO_THETA_006_START = Date.parse('2026-10-01T10:00:00-04:00'); // 10:00 AM ET Oct 1: combo second coefficient 0.04 -> 0.06
const TABLE_TENNIS_START = Date.parse('2026-10-07T10:00:00-04:00');    // 10:00 AM ET Oct 7: Table Tennis Θ = 0.10
const COMBO_THETA_0085_START = Date.parse('2026-10-28T22:00:00-04:00'); // 10:00 PM ET Oct 28: combo second coefficient 0.06 -> 0.085
// 1:00 PM ET Nov 6: Θ is set per account by trailing 30-day taker volume, 0.095 below $10k down to 0.0695 at $250k+,
// and Table Tennis moves onto the same ladder. The trade files carry no account, so the lowest tier is applied.
const TAKER_TIERS_START = Date.parse('2026-11-06T13:00:00-05:00');
const COMBO_THETA_006_RETURN = Date.parse('2026-11-11T13:00:00-05:00'); // 1:00 PM ET Nov 11: combo second coefficient 0.085 -> 0.06
const STANDARD_THETA = 0.0695;    // standard Θ from Sep 16, the lowest taker tier (Tier 4) from Nov 6
const TABLE_TENNIS_THETA = 0.10;

function comboSecondTheta(time: number) {
    if (time < COMBO_THETA_006_START) return 0.04;
    if (time < COMBO_THETA_0085_START) return 0.06;
    if (time < COMBO_THETA_006_RETURN) return 0.085;
    return 0.06;
}

// Combo taker fee = C × p × [Θ × (1 - p) + comboTheta × (1 - p)^4]
// Θ is fixed at 0.0695 until Nov 11, then it is the account's taker tier (0.0695 floor applied)
function comboFee(trade: Trade, takerTheta: number) {
    const comboTheta = comboSecondTheta(trade.transactionTime);
    return Math.round(trade.lastQuantity * trade.lastPrice * (takerTheta * (1 - trade.lastPrice) + comboTheta * (1 - trade.lastPrice) ** 4) * 100) / 100;
}

// busy days' files are larger than the max JS string length (20261108-time-and-sales.csv is 571 MB), so they are streamed line by line
async function* streamLines(url: string) {
    const res = await axios.get(url, { responseType: 'stream' });
    res.data.setEncoding('utf8');
    let rest = '';
    for await (const chunk of res.data) {
        const lines = (rest + chunk).split('\n');
        rest = lines.pop()!;
        yield* lines;
    }
    if (rest) yield rest;
}

async function parseTradeCSV(fileDate: string, fromMs: number, toMs: number, repeatLines = new Map<string, number>(), retries = 3): Promise<{ trades: Trade[], early: Map<string, number> }> {
    try {
        return await parseTradeLines(streamLines(`${BASE_URL}/${fileName(fileDate)}`), fileDate, fromMs, toMs, new Map(repeatLines));
    } catch (error) {
        if (retries > 0) return parseTradeCSV(fileDate, fromMs, toMs, repeatLines, retries - 1);
        throw error;
    }
}

async function parseTradeLines(lines: AsyncIterable<string>, fileDate: string, fromMs: number, toMs: number, repeats: Map<string, number>) {
    const trades: Trade[] = [];
    const early = new Map<string, number>();

    const prevDate = new Date(Date.parse(`${fileDate}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
    const open = `${prevDate}T17:00:00`;

    let header = true;
    for await (const rawLine of lines) {
        const line = rawLine.trim();
        if (header) {
            header = false;
            continue;
        }
        if (!line) continue;
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
    const toMs = fromMs + 86400_000;
    const fileDates = [options.dateString, new Date(toMs).toISOString().slice(0, 10)];

    // a UTC day spans two 17:00 ET files; the next day's file lands after its close.
    // partial data is stored and a later refill (reconcile job) replaces it once the missing file is published.
    const manifestData = await fetchURL(`${BASE_URL}/manifest.json`);
    const available = new Set(fileDates.filter((fileDate) =>
        manifestData.files.some((item: any) => item.filename === fileName(fileDate))
    ));
    if (available.size === 0) throw new Error(`No data found for ${fileDates.join(' or ')}`);

    const [dayFile, nextFile] = fileDates;
    const next = available.has(nextFile)
        ? await parseTradeCSV(nextFile, fromMs, toMs)
        : { trades: [] as Trade[], early: new Map<string, number>() };
    const day = available.has(dayFile)
        ? await parseTradeCSV(dayFile, fromMs, toMs, next.early)
        : { trades: [] as Trade[] };
    const tradesData = day.trades.concat(next.trades);

    const tableTennisLeagues = fromMs < TAKER_TIERS_START && toMs > TABLE_TENNIS_START
        ? await getTableTennisLeagues()
        : new Set<string>();

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
          const isTableTennis = time >= TABLE_TENNIS_START && time < TAKER_TIERS_START && tableTennisLeagues.has(leagueOf(trade.symbol));
          const takerTheta = isTableTennis ? TABLE_TENNIS_THETA : STANDARD_THETA;
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
    Fees: 'Taker fees computed as Θ × C × p × (1 - p), where C is contracts and p is trade price. Θ = 0.0695 from 11:59 PM ET 2026-09-16, Θ = 0.06 from 12:00 AM ET 2026-07-01, Θ = 0.05 from 2026-04-04, flat 1% from 2026-01-09 to 2026-04-03. Table Tennis markets pay Θ = 0.10 from 10:00 AM ET 2026-10-07 until 1:00 PM ET 2026-11-06. From 1:00 PM ET 2026-11-06 Θ is set per account by trailing 30-day taker volume (0.095 below $10k down to 0.0695 at $250k+); the public trade files carry no account, so the lowest tier (0.0695) is applied to every trade and fees from that date are a lower bound. Combo trades (launched 2026-08-11) use the same formula until 11:59 PM ET 2026-09-24, then pay C × p × [Θ × (1 - p) + k × (1 - p)^4], with k = 0.04, raised to 0.06 from 10:00 AM ET 2026-10-01, to 0.085 from 10:00 PM ET 2026-10-28 and back to 0.06 from 1:00 PM ET 2026-11-11. Revenue breakdowns are not available due to lack of per-trader volume data.',
    UserFees: 'Taker fees paid by users, computed as Θ × C × p × (1 - p), where C is contracts and p is trade price. Θ = 0.0695 from 11:59 PM ET 2026-09-16, Θ = 0.06 from 12:00 AM ET 2026-07-01, Θ = 0.05 from 2026-04-04, flat 1% from 2026-01-09 to 2026-04-03. Table Tennis markets pay Θ = 0.10 from 10:00 AM ET 2026-10-07 until 1:00 PM ET 2026-11-06. From 1:00 PM ET 2026-11-06 Θ is set per account by trailing 30-day taker volume (0.095 below $10k down to 0.0695 at $250k+); the public trade files carry no account, so the lowest tier (0.0695) is applied to every trade and fees from that date are a lower bound. Combo trades (launched 2026-08-11) use the same formula until 11:59 PM ET 2026-09-24, then pay C × p × [Θ × (1 - p) + k × (1 - p)^4], with k = 0.04, raised to 0.06 from 10:00 AM ET 2026-10-01, to 0.085 from 10:00 PM ET 2026-10-28 and back to 0.06 from 1:00 PM ET 2026-11-11. Revenue breakdowns are not available due to lack of per-trader volume data.',
    // Revenue: 'Protocol revenue after maker rebates are distributed at trade time. Volume-tier taker rebates (paid weekly) are not deducted.',
    // ProtocolRevenue: 'Net taker fees retained by the protocol after maker rebates (Θ = 0.0475 × C × p × (1 - p) from 2026-07-01)',
    // SupplySideRevenue: 'Maker rebates credited at trade time (Θ = 0.0125 × C × p × (1 - p) from 2026-07-01). Volume-tier taker rebates are excluded.',
}

const breakdownMethodology = {
    Fees: {
        'Taker Fees': 'Fees paid by the aggressor on each trade, computed as Θ × C × p × (1 - p), with Θ = 0.10 on Table Tennis markets from 10:00 AM ET 2026-10-07 until 1:00 PM ET 2026-11-06. From 1:00 PM ET 2026-11-06 the lowest account tier (Θ = 0.0695) is applied, so these fees are a lower bound',
        'Combo Taker Fees': 'Fees paid by the aggressor on each combo trade since combos launched on 2026-08-11, computed on the combo execution price as Θ × C × p × (1 - p) until 11:59 PM ET 2026-09-24, then C × p × [Θ × (1 - p) + k × (1 - p)^4], with k = 0.04, raised to 0.06 from 10:00 AM ET 2026-10-01, to 0.085 from 10:00 PM ET 2026-10-28 and back to 0.06 from 1:00 PM ET 2026-11-11. From 1:00 PM ET 2026-11-11 Θ is the account taker tier and the lowest (0.0695) is applied, so these fees are a lower bound',
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
    unknownBreakdownMethodology: {
        SupplySideRevenue: {
            'Maker Rebates (Tiered)': 'Makers get a rebate set by their maker volume in the prior month, credited at each fill. Per-trader volumes are not public.',
            'Taker Volume Rebates': 'Takers get back 0-30% of the taker fees they paid, set by their volume in the prior month and paid weekly. Per-trader volumes are not public.',
        },
    },
    skipBreakdownValidation: true,
}

export default adapter;
