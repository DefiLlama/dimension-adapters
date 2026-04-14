import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

function parsePrometheusMetrics(data: string): Map<string, string> {
    const lines = data.split('\n');
    let metrics = new Map<string, string>();

    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        } else {
            const [name, value, _t] = line.split(' ');
            metrics.set(name, value);
        }
    }

    return metrics;
}

async function fetchAndParseMetrics(url: string): Promise<Map<string, string>> {
    const response = await httpGet(url);
    return parsePrometheusMetrics(response);
}

async function fetchMetrics(_a: any, _b: any, options: FetchOptions) {
    const URL = "https://tsbvt-pyaaa-aaaar-qafva-cai.raw.icp0.io/metrics";
    const res = await fetchAndParseMetrics(URL);
    const E8S = 100000000;
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    dailyFees.addCGToken("internet-computer", Number(res.get("fees")) / E8S);
    dailyRevenue.addCGToken("internet-computer", Number(res.get("revenue")) / E8S)
    
    const dailySupplySideRevenue = dailyFees.clone(1)
    dailySupplySideRevenue.subtract(dailyRevenue)
    
    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
}

export default {
    adapter: {
        [CHAIN.ICP]: {
            fetch: fetchMetrics,
            start: '2025-01-16',
            runAtCurrTime: true,
        },
    },
    methodology: {
        Fees: "Staking rewards earned by all staked ICP in the protocol.",
        Revenue: "WaterNeuron DAO takes a 10% fee on users staking rewards.",
        HoldersRevenue: "WaterNeuron DAO applies a 10% fee on staking rewards that are directed towards WTN (the DAO token) stakers.",
        SupplySideRevenue: "Staking rewards earned by ICP stakers.",
    }
};
