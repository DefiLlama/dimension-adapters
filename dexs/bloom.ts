import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

type DuneVolumeRow = {
  daily_volume?: string | number | null;
};

// Bloom emits this event from every router it deploys, so the routers are discovered from it
// rather than listed by hand. The hand-kept list is what broke: BSC moved to a new router on
// 2026-08-03 and Base has rotated four times since July, taking both chains to zero volume.
const BLOOM_FEE_TOPIC = "0x2d720abb2e4bf42730e89955397ce0f5b08db0caff9be7e08ca184a8b1b2db2f";

const chainConfig: Record<string, { start: string; duneChain?: string }> = {
  [CHAIN.SOLANA]: {
    start: "2024-10-01",
  },
  [CHAIN.BASE]: {
    start: "2024-12-12",
    duneChain: "base",
  },
  [CHAIN.BSC]: {
    start: "2025-02-13",
    duneChain: "bnb",
  },
};

const fetchSolana = (options: FetchOptions) => queryDuneSql(options, `
  SELECT
    COALESCE(SUM(amount_usd), 0) AS daily_volume
  FROM
    bloom_solana.bot_trades
  WHERE
    TIME_RANGE
    AND is_last_trade_in_transaction = true
`) as Promise<DuneVolumeRow[]>;

const fetchEvm = (options: FetchOptions, config: { start: string; duneChain?: string }) => {
  return queryDuneSql(options, `
    WITH bloom_routers AS (
      SELECT DISTINCT
        contract_address
      FROM
        ${config.duneChain}.logs
      WHERE
        topic0 = ${BLOOM_FEE_TOPIC}
        AND TIME_RANGE
    ),
    bot_trades AS (
      SELECT
        trades.tx_hash,
        trades.evt_index,
        trades.amount_usd
      FROM
        dex.trades
      WHERE
        trades.blockchain = '${config.duneChain}'
        AND trades.tx_to IN (SELECT contract_address FROM bloom_routers)
        AND TIME_RANGE
    ),
    last_trades AS (
      SELECT
        tx_hash,
        MAX(evt_index) AS evt_index
      FROM
        bot_trades
      GROUP BY
        tx_hash
    )
    SELECT
      COALESCE(SUM(bot_trades.amount_usd), 0) AS daily_volume
    FROM
      bot_trades
      JOIN last_trades USING (tx_hash, evt_index)
  `) as Promise<DuneVolumeRow[]>;
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  const now = Date.now();
  const tenHoursAgo = now - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const rows = options.chain === CHAIN.SOLANA ? await fetchSolana(options) : await fetchEvm(options, config);
  const [row] = rows;
  dailyVolume.addUSDValue(Number(row.daily_volume));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  doublecounted: true,
  isExpensiveAdapter: true,
};

export default adapter;
