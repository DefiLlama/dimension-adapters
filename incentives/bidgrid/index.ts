import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// Mainnet program ID and BDGR mint: https://bidgrid.win/about
// Program source: https://github.com/BGJ666/bidgrid_ui_2/blob/main/program/programs/program/src/constants.rs
const PROGRAM_ID = "BDGRD2fcnDzz5ueWq39W7tSRDadFJonZUPG6CxQgJGHd";
const BDGR_MINT = "vfF1NjPmzGgV9ZoC5CWT5W5RpxhHA5TL1DisbShbdgr";
// Anchor event discriminator for ResetEvent. Source:
// https://github.com/BGJ666/bidgrid_ui_2/blob/main/program/programs/program/src/events.rs
const RESET_EVENT_DISCRIMINATOR = "0x7c16d3bd8f2f9cde";
const LABEL = "BDGR Mining Emissions";

const fetch = async (options: FetchOptions) => {
  const query = `
    WITH reset_events AS (
      SELECT log_message
      FROM solana.instruction_calls
      CROSS JOIN UNNEST(log_messages) AS u(log_message)
      WHERE TIME_RANGE
        AND executing_account = '${PROGRAM_ID}'
        AND is_inner = false
        AND tx_success = true
        AND starts_with(log_message, 'Program data: ')
        AND varbinary_starts_with(from_base64(substr(log_message, 15)), ${RESET_EVENT_DISCRIMINATOR})
    )
    SELECT COALESCE(SUM(
        -- ResetEvent.total_minted is the u64 field at the 163 one-based byte
        -- offset in the event payload after the 8-byte event discriminator.
        varbinary_to_bigint(varbinary_reverse(varbinary_substring(
          from_base64(substr(log_message, 15)), 163, 8
      )))
    ), 0) AS raw_amount
    FROM reset_events
  `;

  const [row = {}] = await queryDuneSql(options, query);
  const dailyTokenIncentives = options.createBalances();
  dailyTokenIncentives.add(BDGR_MINT, row.raw_amount ?? 0, LABEL);

  return { dailyTokenIncentives };
};

const methodology = {
  TokenIncentives:
    "BDGR tokens emitted by successful top-level BidGrid ResetEvent events.",
};

const breakdownMethodology = {
  TokenIncentives: {
    [LABEL]:
      "BDGR mining emissions decoded from successful BidGrid ResetEvent payloads.",
  },
};

const adapter: SimpleAdapter = {
  // Dune-backed adapters run once per day in DefiLlama.
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-08-16",
  protocolType: ProtocolType.PROTOCOL,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
