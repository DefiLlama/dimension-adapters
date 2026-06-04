import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// ref https://dune.com/queries/4179280/7034657
const chainConfig: Record<string, { start: string; wallets: string[] }> = {
  [CHAIN.SOLANA]: {
    start: "2024-07-26",
    wallets: [
      "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A",
      "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ",
      "4Lpvp1q69SHentfYcMBUrkgvppeEx6ovHCSYjg4UYXiq",
      "4DGMLhJqTBAB9xs1FodvXrfbdo5YqPSfDRaK1KZFXd1V",
    ],
  },
  [CHAIN.BSC]: {
    start: "2025-04-05",
    wallets: [
      "0xE22B05eEBfd497adF4f54c033e028500e5AC19d8",
      "0x0422B4799A2ea25E9bd72210daA87F2B03CeF18B",
    ],
  },
};

const formatSolanaAddresses = (addresses: string[]) => addresses.map((address) => `'${address}'`).join(", ");
const formatEvmAddresses = (addresses: string[]) => addresses.map((address) => address.toLowerCase()).join(", ");
const containsSolanaAddress = (addresses: string[]) => addresses.map((address) => `CONTAINS(account_keys, '${address}')`).join(" OR ");

const fetchSolana = async (options: FetchOptions) => {
  const { wallets } = chainConfig[CHAIN.SOLANA];
  const [row] = await queryDuneSql(options, `
    WITH mevx_txs AS (
        SELECT id AS tx_id
        FROM solana.transactions
        WHERE TIME_RANGE
          AND success = true
          AND (${containsSolanaAddress(wallets)})
    ),
    trades AS (
      SELECT tx_id, amount_usd
      FROM dex_solana.trades
      WHERE TIME_RANGE
        AND trader_id NOT IN (${formatSolanaAddresses(wallets)})
    )
    SELECT COALESCE(SUM(trades.amount_usd), 0) AS volume
    FROM trades
    JOIN mevx_txs ON trades.tx_id = mevx_txs.tx_id
  `);

  return Number(row?.volume);
};

const fetchEvm = async (options: FetchOptions) => {
  const { wallets } = chainConfig[options.chain];
  const [row] = await queryDuneSql(options, `
    WITH mevx_txs AS (
        SELECT DISTINCT tx_hash
        FROM transfers_bnb.bnb
        WHERE TIME_RANGE
          AND wallet_address IN (${formatEvmAddresses(wallets)})
    ),
    trades AS (
      SELECT tx_hash, amount_usd
      FROM dex.trades
      WHERE TIME_RANGE
        AND blockchain = 'bnb'
        AND tx_from NOT IN (${formatEvmAddresses(wallets)})
        AND (taker IS NULL OR taker NOT IN (${formatEvmAddresses(wallets)}))
    )
    SELECT COALESCE(SUM(trades.amount_usd), 0) AS volume
    FROM trades
    JOIN mevx_txs ON trades.tx_hash = mevx_txs.tx_hash
  `);

  return Number(row?.volume);
};

const fetch = async (_timestamp: number, _chainBlocks: unknown, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const volume = options.chain === CHAIN.SOLANA ? await fetchSolana(options) : await fetchEvm(options);

  dailyVolume.addUSDValue(volume);
  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD swap volume routed through Mevx.",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: chainConfig,
  fetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology,
};

export default adapter;
