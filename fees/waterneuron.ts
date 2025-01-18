import { CHAIN } from "../helpers/chains";

async function fetchPrice(): Promise<number> {
    try {
      const response = await fetch('https://min-api.cryptocompare.com/data/generateAvg?fsym=ICP&tsym=USD&e=coinbase');
      
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      
      const data = await response.json();
      
      return data.RAW.PRICE;
    } catch (error) {
        throw new Error('There was a problem with the fetch operation:');
    }
  }

function parsePrometheusMetrics(data: string): Map<string, string> {
    const lines = data.split('\n');
    let metrics = new Map<string, string>();

    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        } else {
            const [name, value, timestamp] = line.split(' ');
            metrics.set(name, value);
        }
    }

    return metrics;
}

async function fetchAndParseMetrics(url: string): Promise<Map<string, string>> {
    try {
        const response = await fetch(url, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const rawData = await response.text();
        return parsePrometheusMetrics(rawData);
    } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
    }
}

async function fetchMetrics() {
    const URL = "https://tsbvt-pyaaa-aaaar-qafva-cai.raw.icp0.io/metrics";

    const res = await fetchAndParseMetrics(URL);

    const icp_price = await fetchPrice();

    const E8S = 100000000;

    const fees = Number(res.get("fees")) / E8S * icp_price || "0";  
    const revenue = Number(res.get("revenue")) / E8S * icp_price|| "0";

    return {
        dailyUserFees: fees,
        dailyFees: fees,
        dailyRevenue: revenue,
        dailyProtocolRevenue: revenue,
    };
}

export default {
    version: 2,
    adapter: {
        [CHAIN.ICP]: {
        fetch: fetchMetrics,
        start: '2025-01-16',
        meta: {
            methodology: {
            UserFees: "WaterNeuron takes 10% fee on users staking rewards",
            Fees: "Staking rewards earned by all staked ICP",
            Revenue: "Staking rewards",
            ProtocolRevenue: "WaterNeuron applies a 10% fee on staking rewards that are directed towards WTN (the DAO token) stakers.",
            SupplySideRevenue: "Staking rewards earned by nICP holders"
            }
        }
        },
    },
};

(async () => {
    fetchMetrics();
})();