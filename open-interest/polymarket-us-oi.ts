import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const BASE_URL = "https://www.polymarketexchange.com/files/daily-market-report";

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

function parseEndOfDayReportCSV(csv: string): number[] {
    const lines = csv.trim().split('\n');
    const openInterests: number[] = [];

    for (let i = 1; i < lines.length; i++) {
        const columns = parseCSVLine(lines[i]);
        openInterests.push(parseFloat(columns[7]) || 0);
    }
    return openInterests;
}

async function fetch(options: FetchOptions) {
    const openInterestAtEnd = options.createBalances();

    const manifestData = await fetchURL(`${BASE_URL}/manifest.json`);
    const todaysData = manifestData.files.find((item: any) => item.filename === `${options.dateString.replaceAll('-', '')}-daily-market-report.csv`);

    if (!todaysData) {
        throw new Error(`No data found for ${options.dateString}`);
    }

    const csvResponse = await fetchURL(`${BASE_URL}/${todaysData.filename}`);
    const endOfDayReportData = parseEndOfDayReportCSV(csvResponse);

    for (const openInterest of endOfDayReportData) {
        openInterestAtEnd.addUSDValue(openInterest);
    }

    return { openInterestAtEnd };
}

const adapter: SimpleAdapter = {
    fetch,
    start: "2025-10-30",
    chains: [CHAIN.OFF_CHAIN],
}

export default adapter;