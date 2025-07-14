import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const START_DATE = "2025-07-14";
const FEE_COLLECTOR = "7cMEhpt9y3inBNVv8fNnuaEbx7hKHZnLvR1KWKKxuDDU";
const FEE_PAYER = "9AmV7H1yogUGGbmyZUbKKKiCwbBoXrZgxMNQziBZjkhL";
const USDC_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const PROTOCOL_FEE_TYPE = "protocol";
const REFERRER_FEE_TYPE = "referrer";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
      WITH
      fee_txs AS (
        SELECT DISTINCT tx_id
        FROM
          tokens_solana.transfers
        WHERE
          block_time >= TIMESTAMP '${START_DATE}'
          AND TIME_RANGE
          AND to_owner = '${FEE_COLLECTOR}'
          AND token_mint_address = '${ADDRESSES.solana.USDC}'
      )
      SELECT
        SUM(transfers.amount) AS fee_amount,
        CASE
          WHEN transfers.to_owner = '${FEE_COLLECTOR}' THEN '${PROTOCOL_FEE_TYPE}'
          ELSE '${REFERRER_FEE_TYPE}'
        END AS fee_type
      FROM
        tokens_solana.transfers AS transfers
        JOIN fee_txs ON transfers.tx_id = fee_txs.tx_id
      WHERE
        TIME_RANGE
        AND token_mint_address = '${ADDRESSES.solana.USDC}'
        AND outer_executing_account = '${USDC_PROGRAM}'
        AND to_owner != '${FEE_PAYER}'
      GROUP BY
        CASE
          WHEN transfers.to_owner = '${FEE_COLLECTOR}' THEN '${PROTOCOL_FEE_TYPE}'
          ELSE '${REFERRER_FEE_TYPE}'
        END
    `;

  const fees = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  fees.forEach((row: any) => {
    dailyFees.add(ADDRESSES.solana.USDC, row.fee_amount);
    if (row.fee_type === PROTOCOL_FEE_TYPE) {
      dailyRevenue.add(ADDRESSES.solana.USDC, row.fee_amount);
    }
  });

  return {
    dailyFees,
    dailyRevenue: dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: START_DATE,
      meta: {
        methodology: {
          Fees: "All trading fees collected from users.",
          Revenue:
            "All protocol fees collected from trading. Does not include referral fees.",
          ProtocolRevenue:
            "All protocol fees collected from trading. Does not include referral fees.",
        },
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
