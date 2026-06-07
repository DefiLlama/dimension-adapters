import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const chainConfig: Record<string, { start: string; contract?: string; feeWallet?: string; program?: string }> = {
  [CHAIN.BASE]: {
    start: "2025-07-03",
    contract: "0x282970F452371454332Ca522cE59F318a2C81484",
  },
  [CHAIN.BSC]: {
    start: "2025-07-03",
    contract: "0xd270845b7EBb0B013DfCCD9cA782a57Bfb7A359A",
  },
  [CHAIN.ETHEREUM]: {
    start: "2025-07-15",
    contract: "0x60943cb06b76A24431659165c81a03c16F1C325C",
  },
  // contract address fetched from swap logs and same deployer across chains, no official docs present.
  [CHAIN.HYPERLIQUID]: {
    start: "2025-05-31",
    contract: "0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97",
  },
  // ref https://dune.com/queries/4002396
  [CHAIN.SOLANA]: {
    start: "2025-01-17",
    feeWallet: "2416yFoX5ep69Ae8u4EoWN2b1jRMC8diygQDf4zqNAQG",
    program: "AveaiuA1emN71q9mS2QQ9BEWNAAHmp8sHSvwLFHQjufM",
  },
};

const fetchEVM = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const dailyFees = createBalances();
  const { contract } = chainConfig[options.chain];
  const feeTopic = "0xc08acb1892d97145a15c4cc6206956e56a7482a9af175f548b7b40eb336790dd";
  const logs = await getLogs({ target: contract, topics: [feeTopic], onlyArgs: false });

  logs.forEach((log: any) => {
    const token = "0x" + log.topics[1].slice(26);
    const amount = BigInt(log.data);

    // Majority of fees are collected in native gas tokens, tokens is a fallback if fees are charged in erc20s.
    if (token.toLowerCase() === ADDRESSES.GAS_TOKEN_2) {
      dailyFees.addGasToken(amount, METRIC.TRADING_FEES);
    } else {
      dailyFees.add(token, amount, METRIC.TRADING_FEES);
    }
  });

  return dailyFees;
};

const fetchSolana = async (options: FetchOptions) => {
  const { feeWallet, program } = chainConfig[options.chain];
  const dailyFees = options.createBalances();

  const rows = await queryDuneSql(options, `
    WITH fee_transfers AS (
      SELECT
        tx_id,
        amount
      FROM tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND action = 'transfer'
        AND token_mint_address IN (
          'So11111111111111111111111111111111111111111',
          'So11111111111111111111111111111111111111112'
        )
        AND to_owner = '${feeWallet}'
        AND (from_owner IS NULL OR from_owner <> '${feeWallet}')
    )
    SELECT
      CAST(COALESCE(SUM(amount), uint256 '0') AS VARCHAR) AS daily_fees
    FROM fee_transfers f
    WHERE EXISTS (
      SELECT 1
      FROM solana.transactions t
      WHERE
        TIME_RANGE
        AND t.id = f.tx_id
        AND t.success = true
        AND CONTAINS(t.account_keys, '${program}')
    )
    AND EXISTS (
      SELECT 1
      FROM dex_solana.trades t
      WHERE
        TIME_RANGE
        AND t.tx_id = f.tx_id
        AND t.trader_id != '${feeWallet}'
    )
  `) as { daily_fees?: string | number }[];

  dailyFees.add(ADDRESSES.solana.SOL, rows[0]?.daily_fees, METRIC.TRADING_FEES);

  return dailyFees;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.chain === CHAIN.SOLANA ? await fetchSolana(options) : await fetchEVM(options);
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, };
};

const methodology = {
  Fees: "Fees collected on each swap (0.5% for chain wallets, 0.8% for bot wallets).",
  Revenue: "All fees are collected by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees collected on each swap (0.5% for chain wallets, 0.8% for bot wallets).",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "All fees are collected by the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapter;
