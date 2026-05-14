import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const LEDGER_ID = "2ouva-viaaa-aaaaq-aaamq-cai";
const ACCOUNT_ID = "4bkt6-4aaaa-aaaaf-aaaiq-cai";

// Token decimals on ICP (e8s = 10^8 base units)
const E8S = 1e8;

// Membership prices in token base units (e8s), 1month, 3months, 1year
const PRICES = {
  ICP:  { "1m": 0.15, "3m": 0.35, "1y": 1.00, lifetime: 4.00 },
  CHAT: { "1m": 2,    "3m": 5,    "1y": 15,   lifetime: 60   },
};

async function fetch(options: FetchOptions) {
    let response;
    const ONE_MONTH = 30 * 24 * 60 * 60; // 30 days in seconds
    const timeWindow = options.endTimestamp - options.startTimestamp;
    const STEP = timeWindow >= ONE_MONTH ? 86400 : 3600;

    try {
        response = await httpGet(`https://icrc-api.internetcomputer.org/api/v1/ledgers/${LEDGER_ID}/transaction-volume`
            + `?start=${options.startTimestamp}`
            + `&end=${options.endTimestamp}`
            + `&step=${STEP}`
            + `&account_id=${ACCOUNT_ID}`);
    } catch (e) {
        throw new Error(`Error fetching metrics: ${(e as Error).message}`);
    }

    const dailyVolumeCHAT = parseFloat(response.meta.total_volume_for_dataset);

    const dailyFees = options.createBalances();

    dailyFees.add("openchat", dailyVolumeCHAT);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ICP],
    start: '2026-05-13',
    methodology: {
        Fees: "CHAT token volume transacted through the OpenChat diamond membership canister.",
        Revenue: "CHAT token volume received by the OpenChat protocol canister.",
    }
};

export default adapter;