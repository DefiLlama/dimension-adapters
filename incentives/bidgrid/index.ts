import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const PROGRAM_ID = "BDGRD2fcnDzz5ueWq39W7tSRDadFJonZUPG6CxQgJGHd";
const BDGR_MINT = "vfF1NjPmzGgV9ZoC5CWT5W5RpxhHA5TL1DisbShbdgr";
const RESET_EVENT_DISCRIMINATOR = "0x7c16d3bd8f2f9cde";
const LABEL = "BDGR Mining Emissions";

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH reset_events AS (
      SELECT log_message
      FROM solana.instruction_calls
      CROSS JOIN UNNEST(log_messages) AS u(log_message)
      WHERE block_date BETWEEN date(from_unixtime(${options.fromTimestamp}))
        AND date(from_unixtime(${options.toTimestamp}))
        AND block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
        AND executing_account = '${PROGRAM_ID}'
        AND is_inner = false
        AND tx_success = true
        AND starts_with(log_message, 'Program data: ')
        AND varbinary_starts_with(from_base64(substr(log_message, 15)), ${RESET_EVENT_DISCRIMINATOR})
    )
    SELECT COALESCE(SUM(
      varbinary_to_bigint(varbinary_reverse(varbinary_substring(
        from_base64(substr(log_message, 15)), 163, 8
      )))
    ), 0) AS raw_amount
    FROM reset_events
  `;

  const [row = {}] = await queryDuneSql(options, query);
  const tokenIncentives = options.createBalances();
  tokenIncentives.add(BDGR_MINT, row.raw_amount ?? 0, LABEL);

  return { tokenIncentives };
};

const adapter: SimpleAdapter = {
  // Dune-backed adapters run once per day in DefiLlama.
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: { fetch, start: "2026-08-16" },
  },
  protocolType: ProtocolType.PROTOCOL,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
