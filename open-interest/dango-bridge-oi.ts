import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

const GRAPHQL = "https://api-mainnet.dango.zone/graphql";
const PERPS_CONTRACT = "0x90bc84df68d1aa59a857e04ed529e9a26edbea4f";

const PAIRS = ["perp/btcusd", "perp/ethusd", "perp/solusd", "perp/hypeusd"];

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  let totalOI = 0;

  for (const pairId of PAIRS) {
    try {
      const [stateRes, priceRes] = await Promise.all([
        postURL(GRAPHQL, {
          query: `{
            queryApp(request: {
              wasm_smart: {
                contract: "${PERPS_CONTRACT}",
                msg: { pair_state: { pair_id: "${pairId}" } }
              }
            })
          }`,
        }),
        postURL(GRAPHQL, {
          query: `{ perpsPairStats(pairId: "${pairId}") { currentPrice } }`,
        }),
      ]);

      const state = stateRes?.data?.queryApp?.wasm_smart; // fixed path
      const price = Number(priceRes?.data?.perpsPairStats?.currentPrice || 0);

      if (state && price) {
        const longOI = Number(state.long_oi || 0);
        const shortOI = Math.abs(Number(state.short_oi || 0));
        totalOI += (longOI + shortOI) * price;
      }
    } catch (e) {
      console.error(`Dango OI fetch failed for ${pairId}`, e);
    }
  }

  openInterestAtEnd.addUSDValue(totalOI);
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.DANGO],
  start: "2026-04-07",
  fetch,
  runAtCurrTime: true,
  methodology: {
    OpenInterest: "Total open interest across all Dango perp markets from on-chain pair_state queries.",
  },
};

export default adapter;