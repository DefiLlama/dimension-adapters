import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";

// Sentry (sentry.trading): token launchpad on Robinhood Chain. Every
// launch locks its liquidity in a Uniswap V3 1% WETH pool; the Sentry
// Goldsky subgraph indexes each pool's swaps from the launch factory's
// PoolInitialized events. Volume here is the WETH side of swaps on
// Sentry-launched pools (the same launchpad-pool convention as other
// launchpad listings on this chain).
const ENDPOINT =
  "https://api.goldsky.com/api/public/project_cmm7vh5xwsa8m01qmdr7w7u62/subgraphs/sentry-robinhood/1.1.0/gn";

const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";

const query = gql`
  query SentryVolume($protocolDayId: ID!) {
    protocolDayData(id: $protocolDayId) {
      volumeWETH
    }
  }
`;

/** Decimal WETH string -> wei bigint. */
function toWei(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded);
}

const fetch = async (options: FetchOptions) => {
  const day = Math.floor(options.startOfDay / 86400);
  const res = await request(ENDPOINT, query, { protocolDayId: `${day}` });

  const dailyVolume = options.createBalances();
  dailyVolume.add(WETH, toWei(res.protocolDayData?.volumeWETH ?? "0"));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-07-02",
      meta: {
        methodology: {
          Volume: "WETH side of every swap on Sentry-launched token pools (Uniswap V3, 1% tier), indexed from the launch factory's PoolInitialized events.",
        },
      },
    },
  },
};

export default adapter;
