import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Huma V2 (PayFi lending) on Solana. Borrower payments realize profit
// (interest yield + late fees) distributed via IncomeDistributedEvent:
//   profit = protocol_income + pool_owner_income + ea_income + remaining
// protocol_fee_bps = 5% -> treasury; remaining -> tranches + first-loss covers.

const PROGRAM = "EVQ4s1b6N1vmWFDv8PRNc77kufBP8HcrSNWXQAhRsJq9"; // institutional credit engine
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const INCOME_DISTRIBUTED_DISC = "0x4e4f7b1264f45a73"; // anchor event discriminator

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Event bytes: disc(8) pool(32) protocol(u128) owner(u128) ea(u128) remaining(u128)
  const query = `
    WITH income_logs AS (
      SELECT from_base64(split(l.logs, ' ')[3]) AS data
      FROM solana.transactions tx
      CROSS JOIN UNNEST(tx.log_messages) AS l(logs)
      WHERE tx.success = true
        AND contains(tx.account_keys, '${PROGRAM}')
        AND TIME_RANGE
        AND l.logs LIKE 'Program data:%'
        AND cardinality(split(l.logs, ' ')) = 3
        AND try(from_base64(split(l.logs, ' ')[3])) IS NOT NULL
    )
    SELECT
      SUM(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 41, 8)))) AS protocol_income,
      SUM(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 57, 8)))) AS pool_owner_income,
      SUM(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 73, 8)))) AS ea_income,
      SUM(bytearray_to_bigint(bytearray_reverse(bytearray_substring(data, 89, 8)))) AS remaining
    FROM income_logs
    WHERE bytearray_substring(data, 1, 8) = ${INCOME_DISTRIBUTED_DISC}
  `;

  const rows = await queryDuneSql(options, query);
  const r = rows?.[0] ?? {};

  const protocolSide =
    Number(r.protocol_income ?? 0) +
    Number(r.pool_owner_income ?? 0) +
    Number(r.ea_income ?? 0);
  const supplySide = Number(r.remaining ?? 0);

  dailyProtocolRevenue.add(USDC, protocolSide);
  dailySupplySideRevenue.add(USDC, supplySide);
  dailyFees.add(USDC, protocolSide);
  dailyFees.add(USDC, supplySide);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Pool profit realized from borrower payments (interest yield + late fees), distributed by the Huma credit engine on each IncomeDistributedEvent.",
  Revenue: "Protocol-side cut of pool profit: Huma treasury protocol fee plus pool owner and evaluation agent rewards.",
  ProtocolRevenue: "Huma treasury protocol fee (protocol_fee_bps, currently 5%) plus pool owner and evaluation agent rewards (currently 0 on live pools).",
  SupplySideRevenue: "Profit paid to liquidity providers — senior and junior tranche lenders and first-loss cover providers.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-10-10',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;
