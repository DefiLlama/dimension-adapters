import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
const plimit = require('p-limit');
const limits = plimit(1);

const CONFIG = {
    CATFEE_ADDRESS: "TCatFee7NWfcD7nD372Udn49H5ok8rYy6Q",
    API_BASE_URL: "https://apilist.tronscanapi.com/api/transfer/trx",
    PAGE_LIMIT: 50,
    START_TIMESTAMP: 1735210273,
} as const;

interface TronTransaction {
    amount: string;
    // Add other fields as needed
}

interface TronAPIResponse {
    data: TronTransaction[];
    page_size: number;
}

async function fetchTransactionPage(params: {
    fromTimestamp: number;
    endTimestamp: number;
    start: number;
}): Promise<TronAPIResponse> {
    const url = new URL(CONFIG.API_BASE_URL);
    const queryParams = {
        address: CONFIG.CATFEE_ADDRESS,
        start: params.start.toString(),
        limit: CONFIG.PAGE_LIMIT.toString(),
        direction: "2",
        reverse: "false",
        start_timestamp: params.fromTimestamp.toString(),
        end_timestamp: params.endTimestamp.toString(),
    };

    Object.entries(queryParams).forEach(([key, value]) =>
        url.searchParams.append(key, value)
    );

    try {
        return await limits(() => fetchURL(url.toString()));
    } catch (error) {
        console.error(`Failed to fetch Tron transactions: ${error}`);
        throw error;
    }
}

async function getDailyFees(fromTimestamp: number, endTimestamp: number): Promise<number> {
    let start = 0;
    let totalFees = 0;

    while (true) {
        const response = await fetchTransactionPage({ fromTimestamp, endTimestamp, start });

        if (response?.page_size === 0) break;
        if (response?.data?.length === 0 || !response?.data) break;

        totalFees += response.data.reduce(
            (acc, tx) => acc + Number(tx?.amount || 0) / 1_000_000,
            0
        );

        if (response?.page_size < CONFIG.PAGE_LIMIT) break;
        start += CONFIG.PAGE_LIMIT;
    }

    return totalFees;
}

async function fetch({ createBalances, endTimestamp, fromTimestamp }: FetchOptions) {
    const dailyRevenue = createBalances();
    const totalRevenue = await getDailyFees(fromTimestamp, endTimestamp);
    dailyRevenue.addCGToken('tron', totalRevenue, 'Buying Energy');

    return {
        dailyFees: dailyRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

export default {
    methodology: {
        Fees: "All fees paid by users for buying energy.",
        Revenue: "All fees are collected by CatFee protocol.",
        ProtocolRevenue: "All fees are collected by CatFee protocol.",
    },
    breakdownMethodology: {
        Fees: {
            'Buying Energy': 'All fees paid by users for buying energy.',
        },
        Revenue: {
            'Buying Energy': 'All fees are collected by CatFee protocol.',
        },
        ProtocolRevenue: {
            'Buying Energy': 'All fees are collected by CatFee protocol.',
        },
    },
    version: 2,
    fetch,
    chains: [CHAIN.TRON],
    start: CONFIG.START_TIMESTAMP,
};
