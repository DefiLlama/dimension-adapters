import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import { httpGet } from "../../utils/fetchURL";
import { queryDuneSql } from "../../helpers/dune";

type TChain = {
  [key: string]: number;
};
const CHAINS: TChain = {
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.BASE]: 8453,
  [CHAIN.BSC]: 56,
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.POLYGON]: 137,
  // [CHAIN.BLAST]: 81457,
  [CHAIN.LINEA]: 59144,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.MANTLE]: 5000,
  [CHAIN.MODE]: 34443,
  [CHAIN.BERACHAIN]: 80094,
  [CHAIN.INK]: 57073,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.WC]: 480,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.SONIC]: 146,
  [CHAIN.MONAD]: 143,
  [CHAIN.HYPERLIQUID]: 999,
  [CHAIN.ABSTRACT]: 2741,
  [CHAIN.TEMPO]: 4217,
};

const inflatedVolume: Record<string, Array<string>> = {
  [CHAIN.ETHEREUM]: ["2026-03-02", "2026-03-22"],
  [CHAIN.BASE]: ["2026-05-02"],
};

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(
    `https://api.0x.org/stats/volume/daily?timestamp=${options.startOfDay}&chainId=${CHAINS[options.chain]}`,
    {
      headers: {
        "0x-api-key": getEnv("AGGREGATOR_0X_API_KEY"),
      },
    },
  );

  let dailyVolume = 0;

  if (
    !inflatedVolume[options.chain] ||
    !inflatedVolume[options.chain].includes(options.dateString)
  )
    dailyVolume = response.data.volume;

  return {
    dailyVolume,
  };
};

const SOLANA_PROGRAM = "Sett1erwx2eqT5A8uvu8GBxDFT2W5TNnhirL7hLmb8m";

const fetchSolana = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error(
      "End timestamp is less than 10 hours ago, skipping due to dune indexing delay",
    );
  }
  const data = await queryDuneSql(
    options,
    `
    SELECT COALESCE(SUM(amount_usd), 0) AS volume_24
    FROM dex_solana.trades
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <  from_unixtime(${options.endTimestamp})
      AND trade_source = '${SOLANA_PROGRAM}'
  `,
  );
  const row = data[0];
  if (!row) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return { dailyVolume: row.volume_24 };
};

const adapter: any = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  adapter: {
    ...Object.keys(CHAINS).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch,
          start: "2022-05-17",
        },
      };
    }, {}),
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2026-01-01",
    },
  },
};

export default adapter;
