import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";
import { sleep } from "../../utils/utils";

// Ignoring Paxos USD as most of it is backed by cash.
const stablecoinConfig = {
    "Binance USD": {
        id: 4,
        start: '2020-04-17'
    },
    "PayPal USD": {
        id: 120,
        start: '2023-08-08'
    },
    "Global Dollar": {
        id: 286,
        start: '2025-07-12'
    },
}

const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const FRED_API_KEY = getEnv("FRED_API_KEY");

    if (!FRED_API_KEY) {
        throw new Error("FRED_API_KEY is not set");
    }

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const oneMonthAgo = new Date((options.fromTimestamp * 1000) - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const tbillYieldData = await fetchURL(`https://api.stlouisfed.org/fred/series/observations?series_id=DTB3&observation_start=${oneMonthAgo}&observation_end=${options.dateString}&api_key=${FRED_API_KEY}&file_type=json`)
    const latestObservation = tbillYieldData.observations.findLast((obs: any) => obs.value !== '.');

    if (!latestObservation) {
        throw new Error("No valid tbill yield data found");
    }

    const tbillYield = Number(latestObservation.value);

    const findClosest = (circulatingData: any) => {
        return circulatingData.tokens.findLast((token: any) => token.date <= options.fromTimestamp)
    }

    for (const [name, config] of Object.entries(stablecoinConfig)) {
        if (options.dateString < config.start) {
            dailyFees.addUSDValue(0, `Yields from ${name} backing`)
            continue;
        }

        const circulatingData = await fetchURL(`https://stablecoins.llama.fi/stablecoin/${config.id}`)
        const closestCirculatingData = findClosest(circulatingData)

        if (!closestCirculatingData) {
            throw new Error("No valid circulating data found");
        }

        const circulating = closestCirculatingData.circulating.peggedUSD

        const fees = circulating * tbillYield * (options.toTimestamp - options.fromTimestamp) / (ONE_YEAR_IN_SECONDS * 100)
        dailyFees.addUSDValue(fees, `Yields from ${name} backing`)
        
        if(name === "Global Dollar") {
            dailySupplySideRevenue.addUSDValue(fees, `Yields to Global Dollar partners`)
        } else {
            dailyRevenue.addUSDValue(fees, `Yields from ${name} backing`)
        }

        await sleep(500)
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "Yields from various stablecoins backing assets (Tbills, money market funds, repurchase agreements) issued by Paxos.",
    Revenue: "All the yields from Paypal USD and Binance USD backing are revenue for Paxos.",
    ProtocolRevenue: "All the yields from Paypal USD and Binance USD backing are revenue for Paxos.",
    SupplySideRevenue: "All the yields from Global Dollar backing are distributed to Global Dollar partners.",
}

const breakdownMethodology = {
    Fees: {
        "Yields from Binance USD backing": "Yields from Binance USD backing assets (Tbills, money market funds, repurchase agreements).",
        "Yields from PayPal USD backing": "Yields from PayPal USD backing assets (Tbills, money market funds, repurchase agreements).",
        "Yields from Global Dollar backing": "Yields from Global Dollar backing assets (Tbills, money market funds, repurchase agreements).",
    },
    Revenue: {
        "Yields from Binance USD backing": "Yields from Binance USD backing assets (Tbills, money market funds, repurchase agreements).",
        "Yields from PayPal USD backing": "Yields from PayPal USD backing assets (Tbills, money market funds, repurchase agreements).",
    },
    ProtocolRevenue: {
        "Yields from Binance USD backing": "Yields from Binance USD backing assets (Tbills, money market funds, repurchase agreements).",
        "Yields from PayPal USD backing": "Yields from PayPal USD backing assets (Tbills, money market funds, repurchase agreements).",
    },
    SupplySideRevenue: {
        "Yields to Global Dollar partners": "Yields from Global Dollar backing are distributed to Global Dollar partners.",
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: '2020-04-17',
    methodology,
    breakdownMethodology,
}

export default adapter;
