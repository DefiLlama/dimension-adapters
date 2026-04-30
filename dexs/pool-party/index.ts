import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

/*
 * Pool Party — Canton Network AMM (volume)
 *
 * Source: https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/volume?period=24h
 * Spec:   https://github.com/0xsend/canton-monorepo/issues/3481
 *
 * Pool Party reports volume per token across all pools. In an AMM each swap
 * touches both sides of a pair, so the sum across instruments is 2× the true
 * single-side trading volume. We halve before pricing.
 */

const VOLUME_URL =
  "https://api-mainnet.cantonwallet.com/canton/pool-party/public/v1/volume?period=24h";

// Pool Party SDK instrument IDs (stable per Send Foundation):
//   "Amulet"  : Canton Coin (CC) — priced via coingecko:canton-network
//   "USDCx"   : bridged USDC on Canton — priced as USDC ($1 stable proxy)
//   CUSD UUID : Send's privacy stablecoin — priced as USDC ($1 stable proxy)
//
// Brale issues multiple instruments (CUSD + SBC) from the same issuer party;
// only the CUSD UUID below is in scope. Unknown instrument IDs are skipped.
const CUSD_INSTRUMENT_ID = "481871d4-ca56-42a8-b2d3-4b7d28742946";

const fetch = async (options: FetchOptions) => {
  const data: any = await httpGet(VOLUME_URL);
  const dailyVolume = options.createBalances();

  for (const [instrumentId, amount] of Object.entries(
    (data && data.volume) || {},
  )) {
    const value = Number(amount as string);
    if (!Number.isFinite(value) || value <= 0) continue;

    // AMM volumes are double-counted across both sides of every swap.
    const single = value / 2;

    if (instrumentId === "Amulet") {
      // CC gas token; DefiLlama Canton pricing assumes 18-decimal atomic units.
      dailyVolume.add("coingecko:canton-network", single * 1e18);
    } else if (
      instrumentId === "USDCx" ||
      instrumentId === CUSD_INSTRUMENT_ID
    ) {
      // USDC pricing (6 decimals).
      dailyVolume.add("coingecko:usd-coin", single * 1e6);
    }
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "24h spot/swap volume across CC, CUSD, and USDCx pools, fetched from " +
    "Pool Party's public API on Send Foundation's validator " +
    "(api-mainnet.cantonwallet.com). Per-token volumes are halved to " +
    "single-count AMM swaps. CC priced via canton-network on CoinGecko; " +
    "CUSD and USDCx priced as USDC ($1 stable proxy) since neither has a " +
    "direct CoinGecko listing.",
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
