// Tronscan REST helpers (not RPC): `sdk.chains.tron` only provides the endpoint (`TRONSCAN_API`),
// the paging over `/api/transfer/trx` lives here.
import * as sdk from "@defillama/sdk";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "./env";
const plimit = require('p-limit');

// Tronscan rate limits aggressively, keep the transfer walks sequential across adapters.
const limits = plimit(1);
const PAGE_LIMIT = 50;

interface TronscanTrxTransfer {
    amount: string;
    [key: string]: any;
}

interface TronscanTransferResponse {
    data: TronscanTrxTransfer[];
    page_size: number;
}

async function fetchTrxTransferPage(params: {
    address: string;
    fromTimestamp: number;
    endTimestamp: number;
    start: number;
}): Promise<TronscanTransferResponse> {
    const url = new URL(`${sdk.chains.tron.getTronscanEndpoint()}/api/transfer/trx`);
    const queryParams = {
        address: params.address,
        start: params.start.toString(),
        limit: PAGE_LIMIT.toString(),
        direction: "2",
        reverse: "false",
        // FetchOptions timestamps are in seconds; Tronscan expects milliseconds.
        start_timestamp: (params.fromTimestamp * 1000).toString(),
        end_timestamp: (params.endTimestamp * 1000).toString(),
    };

    Object.entries(queryParams).forEach(([key, value]) =>
        url.searchParams.append(key, value)
    );

    const apiKey = getEnv("TRONSCAN_API_KEY");
    if (!apiKey) throw new Error("TRONSCAN_API_KEY is not set");
    const headers = { "TRON-PRO-API-KEY": apiKey };
    return limits(() => httpGet(url.toString(), { headers }));
}

// Sum of TRX (in TRX, not SUN) received by `address` between the two timestamps (seconds), walking
// every Tronscan `/api/transfer/trx` page.
export async function sumTronscanTrxTransfers({ address, fromTimestamp, endTimestamp }: { address: string; fromTimestamp: number; endTimestamp: number }): Promise<number> {
    let start = 0;
    let total = 0;

    while (true) {
        const response = await fetchTrxTransferPage({ address, fromTimestamp, endTimestamp, start });

        if (response?.page_size === 0) break;
        if (response?.data?.length === 0 || !response?.data) break;

        total += response.data.reduce(
            (acc, tx) => acc + Number(tx?.amount || 0) / 1_000_000,
            0
        );

        if (response?.page_size < PAGE_LIMIT) break;
        start += PAGE_LIMIT;
    }

    return total;
}
