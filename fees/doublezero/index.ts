// Source: https://dune.com/queries/5920586/9559880
// https://docs.malbeclabs.com/paying-fees/
// https://doublezero.xyz/journal/a-primer-to-the-2z-token

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const doubleZero = 'J6pQQ3FAcJQeWPPGppWRb4nM8jU3wLyYbRrLh7feMfvd'

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    WITH txs AS (
    SELECT 
        tx_id,
        instruction_name,
        data,
        account_arguments,
        CAST(args_0[1] AS BIGINT) as amount
    FROM solana.instruction_calls_decoded
    WHERE outer_executing_account = 'dzrevZC94tBLwuHw1dyynZxaXTWyp7yocsinyEVPtt4'
    AND inner_executing_account = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    AND is_inner = true
    AND instruction_name IN ('burn', 'transfer')
    AND TIME_RANGE
    ),
    burn_tx_ids AS (
        SELECT DISTINCT tx_id 
        FROM txs 
        WHERE instruction_name = 'burn'
    )
    SELECT         
      SUM(CASE WHEN b.tx_id IS NULL THEN t.amount ELSE 0 END) AS fees
    FROM txs t
    LEFT JOIN burn_tx_ids b ON t.tx_id = b.tx_id`;

  const fees = await queryDuneSql(options, query);
  dailyFees.add(doubleZero, fees[0].fees);
  const dailySupplySideRevenue = dailyFees.clone(0.9)
  const dailyHoldersRevenue = dailyFees.clone(0.1)
  const dailyRevenue = dailyFees.clone()
  dailyRevenue.subtract(dailySupplySideRevenue)
  const dailyProtocolRevenue = dailyRevenue.clone()
  dailyProtocolRevenue.subtract(dailyHoldersRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-10-03',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "A flat 5% fee is charged on block signature rewards and priority fees. Fees started at epoch 859 (October 4th, 2025) and are denominated in SOL and settled per epoch.",
    Revenue: "5% block reward fees and priority fees are collected by the protocol from validators.",
    ProtocolRevenue: "No protocol revenue",
    HoldersRevenue: "10% of the collected fees are burned",
    SupplySideRevenue: "90% of the collected fees distributed to network contributors"
  },
};

export default adapter;
