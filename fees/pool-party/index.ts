import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

/*
 * Pool Party — Canton Network AMM (fees)
 *
 * Source: https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/fees?period=24h
 * Spec:   https://github.com/0xsend/canton-monorepo/issues/3481
 *
 * Phase 1: only `totalFees` is populated. supplySideRevenue / protocolRevenue /
 * holdersRevenue are intentionally null per AGW-PPUB-017 (Send Phase 2 spec
 * depends on PQS materialized views for per-swap fee attribution).
 */

const FEES_URL =
  "https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/fees?period=24h";

// Pool Party SDK instrument IDs (stable per Send Foundation):
//   "Amulet"  : Canton Coin (CC) — priced via coingecko:canton-network
//   "USDCx"   : bridged USDC on Canton — priced as USDC ($1 stable proxy)
//   CUSD UUID : Send's privacy stablecoin — priced as USDC ($1 stable proxy)
//
// Fees are not double-counted (collected once per swap, in a single token).
const CUSD_INSTRUMENT_ID = "481871d4-ca56-42a8-b2d3-4b7d28742946";

const fetch = async (options: FetchOptions) => {
  const data: any = await httpGet(FEES_URL);
  const dailyFees = options.createBalances();

  for (const [instrumentId, amount] of Object.entries(
    (data && data.totalFees) || {},
  )) {
    const value = Number(amount as string);
    if (!Number.isFinite(value) || value <= 0) continue;

    if (instrumentId === "Amulet") {
      dailyFees.add("coingecko:canton-network", value * 1e18);
    } else if (
      instrumentId === "USDCx" ||
      instrumentId === CUSD_INSTRUMENT_ID
    ) {
      dailyFees.add("coingecko:usd-coin", value * 1e6);
    }
  }

  // Phase 1: dailyUserFees mirrors dailyFees. Revenue split (LP/protocol/holders)
  // intentionally omitted; will land when Send ships Phase 2 fee attribution.
  return { dailyFees, dailyUserFees: dailyFees };
};

const methodology = {
  Fees:
    "All swap fees collected by Pool Party (24h), fetched from Pool Party's " +
    "public API on Send Foundation's validator (api-mainnet.cantonwallet.com). " +
    "CC fees priced via canton-network on CoinGecko; CUSD and USDCx fees " +
    "priced as USDC ($1 stable proxy). Phase 2 will populate " +
    "supplySideRevenue, protocolRevenue, and holdersRevenue once Send's " +
    "per-swap fee attribution views are available.",
  UserFees: "All fees paid by users on swaps.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.CANTON]: {
      fetch,
      start: "2026-04-30",
    },
  },
};

export default adapter;
