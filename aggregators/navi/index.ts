import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { queryEvents } from "../../helpers/sui";

const NAVI_ROUTER_EVENT = '0x88dfe5e893bc9fa984d121e4d0d5b2e873dc70ae430cf5b3228ae6cb199cb32b::slippage::SwapEvent';

function extractCoinTypes(typeString: string) {
  const match = typeString.match(/<([^,]+),\s*([^>]+)>/);
  if (!match) return null;
  return {
    coinIn: match[1].trim(),
    coinOut: match[2].trim()
  };
}

const fetchDailyVolume = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Mengambil event langsung dari RPC Sui menggunakan helper yang sudah dimodifikasi
  const events = await queryEvents({
    eventType: NAVI_ROUTER_EVENT,
    options: {
      startTimestamp: options.fromTimestamp,
      endTimestamp: options.toTimestamp,
    },
  });

  for (const event of events) {
    if (!event.type) continue;

    const coins = extractCoinTypes(event.type);
    if (!coins) continue;

    // Menambahkan volume token masuk (amount_in) ke kalkulasi balance DefiLlama
    if (event.amount_in) {
      dailyVolume.add(coins.coinIn, event.amount_in);
    }
  }

  return {
    dailyVolume,
  };
};

const navi_aggregator: any = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchDailyVolume,
      start: "2024-10-05",
    },
  },
};

export default navi_aggregator;