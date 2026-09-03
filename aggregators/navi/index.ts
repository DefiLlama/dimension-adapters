import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryEventsAllium } from "../../helpers/sui";

const NAVI_ROUTER_EVENT = '0x88dfe5e893bc9fa984d121e4d0d5b2e873dc70ae430cf5b3228ae6cb199cb32b::slippage::SwapEvent';

function extractCoinTypes(typeString: string) {
  const match = typeString.match(/<([^,]+),\s*([^>]+)>/);
  if (!match) return null;
  return {
    coinIn: match[1].trim(),
    coinOut: match[2].trim()
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const events = await queryEventsAllium([NAVI_ROUTER_EVENT], {
    fromTimestamp: options.fromTimestamp,
    toTimestamp: options.toTimestamp,
  });

  for (const event of events[NAVI_ROUTER_EVENT]) {
    if (!event.type) continue;

    const coins = extractCoinTypes(event.type);
    if (!coins) continue;

    if (event.amount_in) {
      dailyVolume.add(coins.coinIn, event.amount_in);
    }
  }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2024-10-05",
    },
  },
};

export default adapter;
