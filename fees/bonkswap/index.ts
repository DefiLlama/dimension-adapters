import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";


const chainConfig = {
  [CHAIN.SOLANA]: {
    start: "2023-04-12",
    programId: "BSwp6bEBihVLdqJRKGgzjcGLHkcTuzmSo1TQkHepzH8p",
  },
};
const FEE_SCALE = 1_000_000_000_000;
const DISCRIMINATORS = {
  swap: "0xf8c69e91e17587c8",
  createPool: "0xe992d18ecf6840bc",
  createCustomPool: "0x5081de849c3a64ea",
  createPoolConfig: "0x23a980c2bfe2c606",
  updatePoolConfig: "0x44eccb7ab33eeafc",
  updateFees: "0xe11b0d064554acbf",
};

const fetch = async (options: FetchOptions) => {
  const PROGRAM_ID = chainConfig[CHAIN.SOLANA].programId;
  const query = `
    WITH ixs AS (
      SELECT
        block_time,
        tx_id,
        outer_instruction_index,
        account_arguments[2] AS pool,
        data,
        account_arguments
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND bytearray_substring(data, 1, 8) IN (${DISCRIMINATORS.swap}, ${DISCRIMINATORS.createPool}, ${DISCRIMINATORS.createCustomPool}, ${DISCRIMINATORS.createPoolConfig}, ${DISCRIMINATORS.updatePoolConfig}, ${DISCRIMINATORS.updateFees})
        AND block_time >= TIMESTAMP '2023-04-12 00:00:00'
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND tx_success = true
    ),
    custom_pools AS (
      SELECT
        block_time,
        pool,
        account_arguments[5] AS pool_config
      FROM ixs
      WHERE bytearray_substring(data, 1, 8) = ${DISCRIMINATORS.createCustomPool}
    ),
    pool_configs AS (
      SELECT
        block_time,
        account_arguments[2] AS pool_config,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 16))) AS DOUBLE) AS lp_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 25, 16))) AS DOUBLE) AS buyback_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 41, 16))) AS DOUBLE) AS project_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 57, 16))) AS DOUBLE) AS mercanti_fee
      FROM ixs
      WHERE bytearray_substring(data, 1, 8) IN (${DISCRIMINATORS.createPoolConfig}, ${DISCRIMINATORS.updatePoolConfig})
    ),
    transfers AS (
      SELECT
        tx_id,
        outer_instruction_index,
        to_token_account,
        token_mint_address,
        CAST(amount AS DOUBLE) AS amount
      FROM tokens_solana.transfers
      WHERE TIME_RANGE
        AND CAST(amount AS DOUBLE) > 0
    ),
    fees AS (
      SELECT
        block_time,
        pool,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 16))) AS DOUBLE) AS lp_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 25, 16))) AS DOUBLE) AS buyback_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 41, 16))) AS DOUBLE) AS project_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 57, 16))) AS DOUBLE) AS mercanti_fee
      FROM ixs
      WHERE bytearray_substring(data, 1, 8) = ${DISCRIMINATORS.createPool}

      UNION ALL

      SELECT
        block_time,
        pool,
        CAST(NULL AS DOUBLE) AS lp_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 9, 16))) AS DOUBLE) AS buyback_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 25, 16))) AS DOUBLE) AS project_fee,
        CAST(bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 41, 16))) AS DOUBLE) AS mercanti_fee
      FROM ixs
      WHERE bytearray_substring(data, 1, 8) = ${DISCRIMINATORS.updateFees}

      UNION ALL

      SELECT
        c.block_time,
        c.pool,
        max_by(pc.lp_fee, pc.block_time) AS lp_fee,
        max_by(pc.buyback_fee, pc.block_time) AS buyback_fee,
        max_by(pc.project_fee, pc.block_time) AS project_fee,
        max_by(pc.mercanti_fee, pc.block_time) AS mercanti_fee
      FROM custom_pools c
      INNER JOIN pool_configs pc
        ON pc.pool_config = c.pool_config
        AND pc.block_time <= c.block_time
      GROUP BY c.block_time, c.pool
    ),
    swaps AS (
      SELECT
        tx_id,
        block_time,
        outer_instruction_index,
        pool,
        CASE
          WHEN bytearray_substring(data, 33, 1) = 0x01 THEN account_arguments[5]
          ELSE account_arguments[6]
        END AS pool_input_account
      FROM ixs
      WHERE bytearray_substring(data, 1, 8) = ${DISCRIMINATORS.swap}
        AND TIME_RANGE
    ),
    swaps_with_fees AS (
      SELECT
        s.*,
        max_by(f.lp_fee, f.block_time) FILTER (WHERE f.lp_fee IS NOT NULL) AS lp_fee,
        max_by(f.buyback_fee, f.block_time) FILTER (WHERE f.buyback_fee IS NOT NULL) AS buyback_fee,
        max_by(f.project_fee, f.block_time) FILTER (WHERE f.project_fee IS NOT NULL) AS project_fee,
        max_by(f.mercanti_fee, f.block_time) FILTER (WHERE f.mercanti_fee IS NOT NULL) AS mercanti_fee
      FROM swaps s
      LEFT JOIN fees f
        ON f.pool = s.pool
        AND f.block_time <= s.block_time
      GROUP BY s.tx_id, s.block_time, s.outer_instruction_index, s.pool, s.pool_input_account
    )
    SELECT
      t.token_mint_address AS mint,
      SUM(t.amount * (COALESCE(s.lp_fee, 1000000000) + COALESCE(s.buyback_fee, 1500000000) + COALESCE(s.project_fee, 500000000) + COALESCE(s.mercanti_fee, 0)) / ${FEE_SCALE}) AS total_fee,
      SUM(t.amount * COALESCE(s.lp_fee, 1000000000) / ${FEE_SCALE}) AS lp_fee,
      SUM(t.amount * COALESCE(s.buyback_fee, 1500000000) / ${FEE_SCALE}) AS buyback_fee,
      SUM(t.amount * COALESCE(s.project_fee, 500000000) / ${FEE_SCALE}) AS project_fee,
      SUM(t.amount * COALESCE(s.mercanti_fee, 0) / ${FEE_SCALE}) AS mercanti_fee
    FROM transfers t
    INNER JOIN swaps_with_fees s
      ON t.tx_id = s.tx_id
      AND t.outer_instruction_index = s.outer_instruction_index
    WHERE t.to_token_account = s.pool_input_account
    GROUP BY 1
  `;

  const data: {
    mint: string,
    total_fee: number,
    lp_fee: number,
    buyback_fee: number,
    project_fee: number,
    mercanti_fee: number,
  }[] = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  for (const row of data) {
    const { mint } = row;
    const totalFee = Number(row.total_fee ?? 0);
    const lpFee = Number(row.lp_fee ?? 0);
    const buybackFee = Number(row.buyback_fee ?? 0);
    const projectFee = Number(row.project_fee ?? 0);
    const mercantiFee = Number(row.mercanti_fee ?? 0);

    dailyFees.add(mint, totalFee, METRIC.SWAP_FEES);
    dailyRevenue.add(mint, buybackFee, METRIC.TOKEN_BUY_BACK);
    dailySupplySideRevenue.add(mint, projectFee, "Project Fees");
    dailySupplySideRevenue.add(mint, lpFee, METRIC.LP_FEES);
    dailySupplySideRevenue.add(mint, mercantiFee, "Referrer Fees");
    dailyHoldersRevenue.add(mint, buybackFee, METRIC.TOKEN_BUY_BACK);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "All swap fees paid by BonkSwap users.",
  Revenue: "Fee share from swaps, used for buybacks.",
  SupplySideRevenue: "Swap fees allocated to liquidity providers, project owners, and referrers.",
  HoldersRevenue: "Swap fees allocated to buybacks.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fees paid by BonkSwap users.",
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "Swap fees allocated to buybacks.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Swap fees allocated to liquidity providers.",
    "Project Fees": "Swap fees allocated to pool project owners.",
    "Referrer Fees": "Swap fees paid to referrers (mercanti fee) during swaps, e.g. Jupiter.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Swap fees allocated to buybacks.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
