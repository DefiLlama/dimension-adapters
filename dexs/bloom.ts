import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type DuneVolumeRow = {
  blockchain: string;
  daily_volume?: string | number | null;
};

// Bloom emits this event from every router it deploys, so the routers are discovered from it
// rather than listed by hand. The hand-kept list is what broke: BSC moved to a new router on
// 2026-08-03 and Base has rotated four times since July, taking both chains to zero volume.
const BLOOM_FEE_TOPIC = "0x2d720abb2e4bf42730e89955397ce0f5b08db0caff9be7e08ca184a8b1b2db2f";

const chainConfig: Record<string, { start: string; duneChain: string }> = {
  [CHAIN.SOLANA]: {
    start: "2024-10-01",
    duneChain: "solana",
  },
  [CHAIN.BASE]: {
    start: "2024-12-12",
    duneChain: "base",
  },
  [CHAIN.BSC]: {
    start: "2025-02-13",
    duneChain: "bnb",
  },
  // the same fee-event discovery finds Bloom's routers on these chains too (deployers listed in fees/bloom.ts)
  [CHAIN.ETHEREUM]: {
    start: "2025-04-05",
    duneChain: "ethereum",
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-04",
    duneChain: "robinhood",
  },
  [CHAIN.ARC]: {
    start: "2026-07-29",
    duneChain: "arc",
  },
};

const solanaQuery = `
  SELECT
    'solana' AS blockchain,
    COALESCE(SUM(amount_usd), 0) AS daily_volume
  FROM
    bloom_solana.bot_trades
  WHERE
    TIME_RANGE
    AND is_last_trade_in_transaction = true
`;

const evmQuery = (duneChains: string[]) => `
  WITH bloom_routers AS (
    ${duneChains.map((duneChain) => `
    SELECT DISTINCT
      '${duneChain}' AS blockchain,
      contract_address
    FROM
      ${duneChain}.logs
    WHERE
      topic0 = ${BLOOM_FEE_TOPIC}
      AND TIME_RANGE`).join(`
    UNION ALL`)}
  ),
  last_trades AS (
    SELECT
      trades.blockchain,
      trades.tx_hash,
      MAX_BY(trades.amount_usd, trades.evt_index) AS amount_usd
    FROM
      dex.trades
      JOIN bloom_routers ON bloom_routers.blockchain = trades.blockchain
        AND bloom_routers.contract_address = trades.tx_to
    WHERE
      trades.blockchain IN (${duneChains.map((duneChain) => `'${duneChain}'`).join(", ")})
      AND TIME_RANGE
    GROUP BY
      1, 2
  )
  SELECT
    chains.blockchain,
    COALESCE(SUM(last_trades.amount_usd), 0) AS daily_volume
  FROM
    (VALUES ${duneChains.map((duneChain) => `('${duneChain}')`).join(", ")}) AS chains (blockchain)
    LEFT JOIN last_trades ON last_trades.blockchain = chains.blockchain
  GROUP BY
    1
`;

const prefetch = async (options: FetchOptions): Promise<any> => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const evmDuneChains = Object.entries(chainConfig)
    .filter(([chain, { start }]) => chain !== CHAIN.SOLANA && Date.parse(`${start}T00:00:00Z`) / 1e3 < options.endTimestamp)
    .map(([, { duneChain }]) => duneChain);

  const results = await Promise.all([
    queryDuneSql(options, solanaQuery) as Promise<DuneVolumeRow[]>,
    evmDuneChains.length ? queryDuneSql(options, evmQuery(evmDuneChains)) as Promise<DuneVolumeRow[]> : Promise.resolve([]),
  ]);
  return results.flat();
};

const fetch = async (options: FetchOptions) => {
  const { duneChain } = chainConfig[options.chain];
  const row = (options.preFetchedResults as DuneVolumeRow[]).find((result) => result.blockchain === duneChain);
  if (!row) throw new Error(`Bloom: no Dune volume row for ${options.chain}`);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(row.daily_volume));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  doublecounted: true,
  isExpensiveAdapter: true,
};

export default adapter;
