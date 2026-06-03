import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Source: Dune GMGN dashboard/query shared with the fees adapter.
type ChainConfig = {
  start: string;
  duneChain?: string;
  contract?: string;
  feeAddresses?: string[];
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.SOLANA]: {
    start: "2024-03-20",
    feeAddresses: [
      "BB5dnY55FXS1e1NXqZDwCzgdYJdMCj3B92PU6Q5Fb6DT",
      "7sHXjs1j7sDJGVSMSPjD1b4v3FD6uRSvRWfhRdfv5BiA",
      "HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3",
      "ByRRgnZenY6W2sddo1VJzX9o4sMU4gPDUkcmgrpGBxRy",
      "DXfkEGoo6WFsdL7x6gLZ7r6Hw2S6HrtrAQVPWYx2A1s9",
      "3t9EKmRiAUcQUYzTZpNojzeGP1KBAVEEbDNmy6wECQpK",
      "DymeoWc5WLNiQBaoLuxrxDnDRvLgGZ1QGsEoCAM7Jsrx",
      "dBhdrmwBkRa66XxBuAK4WZeZnsZ6bHeHCCLXa3a8bTJ",
      "6TxjC5wJzuuZgTtnTMipwwULEbMPx5JPW3QwWkdTGnrn",
    ],
  },
  [CHAIN.BASE]: {
    start: "2025-08-01",
    duneChain: "base",
    contract: "0xd8Ba9D1a99Fc21f0ECA24e9b85737c28A194a4E2",
  },
  [CHAIN.BSC]: {
    start: "2024-01-01",
    duneChain: "bnb",
    contract: "0x1de460f363AF910f51726DEf188F9004276Bf4bc",
  },
};

type DuneVolumeRow = {
  daily_volume?: string | number | null;
};

const fetchSolana = (options: FetchOptions) => {
  const feeAddresses = chainConfig[CHAIN.SOLANA].feeAddresses!;

  return queryDuneSql(options, `
  WITH gmgn_txs AS (
    SELECT DISTINCT
      id AS tx_id
    FROM
      solana.transactions
      CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(account_keys))) AS u(i)
    WHERE
      TIME_RANGE
      AND success = true
      AND account_keys[i] IN (${feeAddresses.map((address) => `'${address}'`).join(", ")})
      AND post_balances[i] > pre_balances[i]
  )
  SELECT
    COALESCE(SUM(amount_usd), 0) AS daily_volume
  FROM
    dex_solana.trades
  WHERE
    TIME_RANGE
    AND trader_id NOT IN (${feeAddresses.map((address) => `'${address}'`).join(", ")})
    AND tx_id IN (SELECT tx_id FROM gmgn_txs)
`) as Promise<DuneVolumeRow[]>;
};

const fetchEvm = (options: FetchOptions) => {
  const config = chainConfig[options.chain];

  return queryDuneSql(options, `
  WITH bot_trades AS (
    SELECT
      trades.tx_hash,
      trades.evt_index,
      trades.amount_usd
    FROM
      dex.trades
    WHERE
      trades.blockchain = '${config.duneChain}'
      AND trades.tx_to = ${config.contract}
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

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const rows = options.chain === CHAIN.SOLANA
    ? await fetchSolana(options)
    : await fetchEvm(options);

  return {
    dailyVolume: Number(rows[0].daily_volume),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
