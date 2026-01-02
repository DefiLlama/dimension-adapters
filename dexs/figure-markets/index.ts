import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const BASE_URL = "https://www.figuremarkets.com/service-hft-exchange/api/v1/markets";

interface Market {
  marketType: string;
  volume24h?: string;
  makerFee?: { rate?: number };
  takerFee?: { rate?: number };
}

async function fetchFees(_: FetchOptions) {
  const locations = ["US", "CAYMAN"];
  let totalFees = 0;
  let totalVolume = 0;

  for (const location of locations) {
    let page = 1;
    const size = 50;

    while (true) {
      const response = await fetchURL(
        `${BASE_URL}?location=${location}&page=${page}&size=${size}&include_hidden=false`
      );

      let markets: Market[];

      if (Array.isArray(response)) {
        markets = response;
      } else if (response.data && Array.isArray(response.data)) {
        markets = response.data;
      } else {
        break;
      }

      if (!markets || markets.length === 0) break;

      for (const market of markets) {
        const volume = Number(market.volume24h || 0);
        if (volume === 0) continue;

        // Include relevant market types
        if (
          ![
            "CRYPTO",
            "PERPETUAL",
            "FUND",
            "ATS",
            "VIRTUAL",
            "VIRTUAL_YLDS",
            "CONNECT",
          ].includes(market.marketType)
        )
          continue;

        // Fee rates are already in decimal format (e.g., 0.001 = 0.1%)
        const makerFeeRate = market.makerFee?.rate ?? 0;
        const takerFeeRate = market.takerFee?.rate ?? 0;

        // Both maker and taker fees are charged per trade
        const totalFeeRate = makerFeeRate + takerFeeRate;

        if (totalFeeRate === 0) continue;

        // volume24h is in USD (quoteDenom), so fees are in USD
        totalFees += volume * totalFeeRate;
        
        // Track total volume
        totalVolume += volume;
      }

      page++;
    }
  }

  return {
    dailyFees: totalFees.toString(),
    dailyRevenue: totalFees.toString(),
    dailyVolume: totalVolume.toString(),
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    provenance: {
      fetch: fetchFees,
      start: 0,
    },
  },
};

export default adapter;