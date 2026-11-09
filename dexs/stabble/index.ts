import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryAllium } from "../../helpers/allium";
import { base58Encode, getMultipleAccounts } from "../../helpers/solana";

// https://github.com/stabbleorg/amm_v1/tree/main/programs
const STABLE_SWAP_PROGRAM = "swapNyd8XiQwJ6ianp9snpu4brUqFxadzvHebnAXjJZ";
const WEIGHTED_SWAP_PROGRAM = "swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW";
const VAULT_PROGRAM = "vo1tWgqZMjG61Z2T9qUaMYKqZ75CYzMuaZ2LZP1n7HV";

const POOL_VAULT_OFFSET = 40;
const SWAP_FEE_OFFSET: Record<string, number> = {
  [STABLE_SWAP_PROGRAM]: 126,
  [WEIGHTED_SWAP_PROGRAM]: 114,
};
const BENEFICIARY_FEE_OFFSET = 107;
const FEE_SCALE = 1e9;

const fetch = async (options: FetchOptions) => {
  const rows = await queryAllium(`
    WITH checks AS (
      SELECT EXISTS (SELECT 1 FROM solana.dex.trades
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    ),
    pools AS (
      SELECT program_id, pool, SUM(usd_amount) AS volume_usd
      FROM solana.dex.trades
      WHERE program_id IN ('${STABLE_SWAP_PROGRAM}', '${WEIGHTED_SWAP_PROGRAM}')
        AND usd_amount IS NOT NULL
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
      GROUP BY 1, 2
    )
    SELECT c.indexed, p.program_id, p.pool, p.volume_usd
    FROM checks c
    LEFT JOIN pools p ON TRUE
  `);
  if (!rows[0]?.indexed) throw new Error(`stabble: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  const trades = rows.filter((row: any) => row.pool !== null);

  const poolAccounts = await getMultipleAccounts({ chain: CHAIN.SOLANA, accounts: trades.map((row: any) => row.pool) });
  const pools = trades.map((row: any, i: number) => {
    const account = poolAccounts[i];
    if (!account) return { volume: Number(row.volume_usd) };
    if (account.owner !== row.program_id) throw new Error(`stabble: pool ${row.pool} is owned by ${account.owner}, not ${row.program_id}`);
    const data = Buffer.from(account.data[0], "base64");
    return {
      volume: Number(row.volume_usd),
      swapFee: Number(data.readBigUInt64LE(SWAP_FEE_OFFSET[row.program_id])) / FEE_SCALE,
      vault: base58Encode(data.subarray(POOL_VAULT_OFFSET, POOL_VAULT_OFFSET + 32)),
    };
  });

  const vaults: string[] = [...new Set<string>(pools.filter((pool: any) => pool.vault).map((pool: any) => pool.vault))];
  const vaultAccounts = await getMultipleAccounts({ chain: CHAIN.SOLANA, accounts: vaults });
  const beneficiaryFee: Record<string, number> = {};
  vaults.forEach((vault, i) => {
    const account = vaultAccounts[i];
    if (!account || account.owner !== VAULT_PROGRAM) throw new Error(`stabble: vault account ${vault} not found`);
    beneficiaryFee[vault] = Number(Buffer.from(account.data[0], "base64").readBigUInt64LE(BENEFICIARY_FEE_OFFSET)) / FEE_SCALE;
  });

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  pools.forEach(({ volume, swapFee, vault }: any) => {
    dailyVolume.addUSDValue(volume);
    if (!vault) return;
    const fees = volume * swapFee;
    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(fees * beneficiaryFee[vault], 'Token Swap Fees To $STB staking pool');
    dailySupplySideRevenue.addUSDValue(fees * (1 - beneficiaryFee[vault]), 'Token Swap Fees To LPs');
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Trading volume across stabble's stable and weighted AMM pools, including swaps routed through aggregators.",
  Fees: "Total swap fees paid by traders, at each pool's on-chain fee rate — the liquidity providers' share plus the protocol's cut.",
  Revenue: "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  HoldersRevenue: "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  SupplySideRevenue: "The 70% of swap fees kept by liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Gross swap fees charged on trades routed through stabble's stable and weighted AMM pools, before the LP/treasury split.",
  },
  Revenue: {
    'Token Swap Fees To $STB staking pool': "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  },
  HoldersRevenue: {
    'Token Swap Fees To $STB staking pool': "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': "The 70% of swap fees kept by the liquidity providers of each pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-06-05',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
