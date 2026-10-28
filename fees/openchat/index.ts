import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const LEDGER_ID = "2ouva-viaaa-aaaaq-aaamq-cai";
const ACCOUNT_ID = "4bkt6-4aaaa-aaaaf-aaaiq-cai";
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

async function fetch(options: FetchOptions) {
    let response;

    try {
        response = await httpGet(`https://icrc-api.internetcomputer.org/api/v1/ledgers/${LEDGER_ID}/transaction-volume`
            + `?start=${options.startTimestamp}`
            + `&end=${options.endTimestamp}`
            + `&step=${ONE_DAY_IN_SECONDS}`
            + `&account_id=${ACCOUNT_ID}`);
    } catch (e) {
        throw new Error(`Error fetching metrics: ${(e as Error).message}`);
    }

    const dailyVolumeCHAT = parseFloat(response.meta.total_volume_for_dataset);

    const dailyFees = options.createBalances();

    dailyFees.addCGToken("openchat", dailyVolumeCHAT);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const adapter: SimpleAdapter = {
    version: 1, // rate limits
    fetch,
    chains: [CHAIN.ICP],
    start: '2023-02-06',
    methodology: {
        Fees: "CHAT token paid for OpenChat diamond membership.",
        Revenue: "CHAT token paid for OpenChat diamond membership.",
        ProtocolRevenue: "CHAT token paid for OpenChat diamond membership.",
    }
};

export default adapter;
