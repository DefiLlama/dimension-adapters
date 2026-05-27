import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { view, getVersionFromTimestamp } from "../../helpers/aptos";

const MODULE = "lotto_run";
const APT_TOKEN = "0x1::aptos_coin::AptosCoin";
const APT_DECIMALS = 1e8;

const POOLS = [
  "0xc38c49cd3008de7e0f41aadd83155ba1e4e380694db1e48b1f13c404e2451f16", // 100 APT
  "0x2ee2377b4b358cdf272cb7f3e8d22525c9d42a7db64816605f10f12819421c37", // 1K APT
  "0x53d1c36ff2af28bf67df3b1b2d2229e6bdf307efd6cacacdff8b4e2c2e1aace8", // 10K APT
  "0x55a51900d3c7bf85347c260448f7e5ffca9f37bbe8157679dbcb274967fae421", // 100K APT
];

// Returns total tickets ever sold for a pool at a given ledger version.
// total = total_draws * pool_size + current_round_sold
async function getTotalTickets(pool: string, version: number): Promise<number> {
  const [poolSize, , currentRound, totalDraws] = await view<[string, string, string, string]>(
    `${pool}::${MODULE}::pool_info`, [], [pool], version
  );
  const [, sold] = await view<[number, string, string, string]>(
    `${pool}::${MODULE}::round_state`, [], [pool, currentRound], version
  );
  return Number(totalDraws) * Number(poolSize) + Number(sold);
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const startVersion = await getVersionFromTimestamp(new Date(options.startTimestamp * 1000));
  const endVersion = await getVersionFromTimestamp(new Date(options.endTimestamp * 1000));

  let totalDailyTickets = 0;

  for (const pool of POOLS) {
    let startTickets = 0;
    try {
      startTickets = await getTotalTickets(pool, startVersion);
    } catch {
      // Pool may not exist at startVersion (before deployment) — treat as 0
    }
    try {
      const endTickets = await getTotalTickets(pool, endVersion);
      totalDailyTickets += Math.max(0, endTickets - startTickets);
    } catch {
      // Pool may not exist at endVersion either — skip
    }
  }

  // Each ticket costs 1 APT
  dailyVolume.add(APT_TOKEN, BigInt(totalDailyTickets) * BigInt(APT_DECIMALS));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-03-18",
    },
  },
  methodology: {
    Volume: "Daily volume is the total APT wagered on lottery tickets across all 4 pools, calculated from the difference in cumulative tickets sold between the start and end of each day.",
  }
};

export default adapter;
