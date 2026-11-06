import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// Ave runs several routers in parallel on each EVM chain. Each one is a proxy under the chain's ProxyAdmin (BSC 0x0e3525f7..,
// Base 0x82a908a7.., Ethereum 0x5fa3422b.., X Layer 0x77edae6a.., Robinhood 0xc2402c84.., Arc 0x15c3759c..). Every ProxyAdmin
// and every router's owner() is 0x31781b4E7FB61756BD0a0Ef7850d5e7bf6270FC4, the owner named in dexs/aveai, and the fee events
// pay the same two wallets, 0x69aaaff7.. and 0x799e3964...
const chainConfig: Record<string, { start: string; contracts?: string[]; feeWallet?: string; program?: string }> = {
  [CHAIN.BASE]: {
    start: "2025-07-03",
    contracts: [
      "0x282970F452371454332Ca522cE59F318a2C81484",
      "0x8a33650bbBd7622D7bF1b98d4ae851c134126C18",
      "0xf0eBB9bA1c3cd95c315f4F80197b85782E756e49",
      "0x5028b3b07a254cee0767f6ba2e2bd459c5efc64f",
      "0xaae8a5bad1824a87d8132313027478b505da471a",
    ],
  },
  [CHAIN.BSC]: {
    start: "2025-07-03",
    contracts: [
      "0xd270845b7EBb0B013DfCCD9cA782a57Bfb7A359A",
      "0xd36b6d646ac6e23672e9eedec558164c7f2d6deb",
      "0x296b00198dc7ec3410e12da814d9267bb8df506a",
      "0xeef1138334c4f7f5b058002b81219048e04f7a2c",
      "0x34a61953419751a99fca665dbea6670d532d64ad",
      "0x8cd019facde1b3d4abb48ce84446d68ee1bcf894",
      "0xe21c2cf3e3ce95974afbfece42100ecb7e14ad37",
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: "2025-07-15",
    contracts: [
      "0x60943cb06b76A24431659165c81a03c16F1C325C",
      "0x77edae6a5f332605720688c7fda7476476e8f83f", // older proxy build, same ProxyAdmin and implementation as 0x60943cb0..
      "0x72cb924a78b9335d547e6896bbcc6b94744927f6",
      "0xe8b8373f80a534cc30680570163301c37d3aaeb1",
    ],
  },
  [CHAIN.XLAYER]: {
    start: "2026-06-25",
    contracts: ["0xc2402c8453f39e97113f094e3402fbbdd7e0ede3", "0x78db03b357f4262c591f305f86a16dacff540c2b"],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-03",
    contracts: [
      "0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97",
      "0x17ba2bb7ade691f2c115f9385383ff617df9dae7",
      "0x31ba053698e5dd483ddc90e671fa99bf699baa14",
    ],
  },
  [CHAIN.ARC]: {
    start: "2026-07-25",
    contracts: ["0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97", "0x991303c0d4c5e27d161052c75f123e6b466b5628"],
  },
  // contract address fetched from swap logs and same deployer across chains, no official docs present.
  [CHAIN.HYPERLIQUID]: {
    start: "2025-05-31",
    contracts: ["0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97"],
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
  const { contracts } = chainConfig[options.chain];
  const feeTopic = "0xc08acb1892d97145a15c4cc6206956e56a7482a9af175f548b7b40eb336790dd";
  const logs = await getLogs({ targets: contracts, topics: [feeTopic], onlyArgs: false, flatten: true });

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
          '${ADDRESSES.solana.SOL}'
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
