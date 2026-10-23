import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// OrbitDEX is a perpetual futures frontend built on Orderly Network's cross-chain orderbook.
// Website: https://trade.orbitdex.app
// Twitter/X: https://x.com/OrbitPerps
// Orderly broker ID: orbit (confirmed via https://api-evm.orderly.org/v1/public/broker/name?broker_id=orbit)

const ORDERLY_API = "https://api-evm.orderly.org";
const BROKER_ID = "orbit";

const fetch = async (_options: FetchOptions) => {
  // Orderly public volume stats API — returns rolling volume windows for a given broker.
  // Source: https://orderly.network/docs/build-on-evm/evm-api/restful-api/public/get-broker-volume-statistics
  const { data } = await fetchURL(
    `${ORDERLY_API}/v1/public/volume/stats?broker_id=${BROKER_ID}`
  );

  return {
    // perp_volume_last_1_day = taker-side notional for the previous UTC day.
    // Orderly Network reports taker volume only — maker volume is not added, so there
    // is no risk of double counting by summing both sides of the same fill.
    // Is a 0-volume day possible? Yes — if no trades are executed on Orbit that day.
    // Numbers may differ slightly from the Orbit dashboard due to rounding and UTC day
    // boundary differences, but the underlying source is the same Orderly API.
    dailyVolume: data.perp_volume_last_1_day,
  };
};

const methodology = {
  dailyVolume:
    "Perpetual futures taker-side notional volume generated through the Orbit frontend " +
    "(Orderly Network broker_id: orbit). Sourced from the Orderly public volume stats API. " +
    "Taker-side only to avoid double counting maker + taker fills. " +
    "Aggregated across all chains where Orderly Network is deployed " +
    "(Ethereum, Arbitrum, Optimism, Base, Solana, and others). " +
    "CHAIN_GLOBAL is used because per-chain breakdowns are not available from this API endpoint " +
    "and the total is not the sum of any set of chain-level figures.",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.CHAIN_GLOBAL]: {
      fetch,
      start: "2026-07-01",
    },
  },
  methodology,
};

export default adapter;
