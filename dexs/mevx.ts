import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// ref https://dune.com/queries/4179280/7034657
const chainConfig: Record<string, { start: string; duneChain: string; wallets: string[] }> = {
  [CHAIN.SOLANA]: {
    start: "2024-07-26",
    duneChain: "solana",
    wallets: [
      "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A",
      "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ",
      "4Lpvp1q69SHentfYcMBUrkgvppeEx6ovHCSYjg4UYXiq",
      "4DGMLhJqTBAB9xs1FodvXrfbdo5YqPSfDRaK1KZFXd1V",
    ],
  },
  [CHAIN.BSC]: {
    start: "2025-04-05",
    duneChain: "bnb",
    wallets: [
      "0xE22B05eEBfd497adF4f54c033e028500e5AC19d8",
      "0x0422B4799A2ea25E9bd72210daA87F2B03CeF18B",
    ],
  },
};

const formatSolanaAddresses = (addresses: string[]) => addresses.map((address) => `'${address}'`).join(", ");
const formatEvmAddresses = (addresses: string[]) => addresses.map((address) => address.toLowerCase()).join(", ");

const fetchSolana = async (options: FetchOptions) => {
  const { wallets } = chainConfig[CHAIN.SOLANA];
  const [row] = await queryDuneSql(options, `
    WITH trades AS (
      SELECT d.tx_id, d.amount_usd
      FROM dex_solana.trades d
      WHERE TIME_RANGE
        AND d.trader_id NOT IN (${formatSolanaAddresses(wallets)})
        AND EXISTS (
          SELECT 1
          FROM solana.account_activity a
          WHERE TIME_RANGE
            AND a.tx_id = d.tx_id
            AND a.tx_success
            AND a.address IN (${formatSolanaAddresses(wallets)})
        )
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS volume
    FROM trades
  `);

  return Number(row?.volume);
};

const fetchEvm = async (options: FetchOptions) => {
  const { duneChain, wallets } = chainConfig[options.chain];
  const [row] = await queryDuneSql(options, `
    WITH trades AS (
      SELECT d.tx_hash, d.amount_usd
      FROM dex.trades d
      WHERE TIME_RANGE
        AND d.blockchain = '${duneChain}'
        AND d.tx_from NOT IN (${formatEvmAddresses(wallets)})
        AND (d.taker IS NULL OR d.taker NOT IN (${formatEvmAddresses(wallets)}))
        AND EXISTS (
          SELECT 1
          FROM transfers_bnb.bnb t
          WHERE TIME_RANGE
            AND t.tx_hash = d.tx_hash
            AND t.wallet_address IN (${formatEvmAddresses(wallets)})
        )
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS volume
    FROM trades
  `);

  return Number(row?.volume);
};

const fetch = async (options: FetchOptions) => {
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
