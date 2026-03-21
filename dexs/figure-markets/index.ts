import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const BASE_URL = "https://www.figuremarkets.com/service-hft-exchange/api/v1/markets";

interface Market {
  marketType: string;
  volume24h: string;
  makerFee?: { rate?: number };
  takerFee?: { rate?: number };
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
  const locations = ["US", "CAYMAN"];
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  for (const location of locations) {
    let page = 1;

    while (true) {
      const response = await fetchURL(`${BASE_URL}?location=${location}&page=${page}`);
      const markets: Market[] = response.data;

      if (!markets || markets.length === 0) break;

      for (const market of markets) {
        const volume = Number(market.volume24h || 0);
        if (volume === 0) continue;

        // Fee rates are already in decimal format (e.g., 0.001 = 0.1%)
        const makerFeeRate = market.makerFee?.rate ?? 0;
        const takerFeeRate = market.takerFee?.rate ?? 0;

        // Both maker and taker fees are charged per trade
        const totalFeeRate = makerFeeRate + takerFeeRate;

        dailyFees.addUSDValue(volume * totalFeeRate);
        dailyVolume.addUSDValue(volume);
      }

      page++;
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PROVENANCE],
  runAtCurrTime: true,
};

export default adapter;