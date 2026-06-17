import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Anchor event discriminators (first 8 bytes):
  //   PositionOpened:  0xedaff3e693756579
  //   PositionClosed:  0x9da3e3e40d618a79
  //
  // PositionOpened layout (after 8-byte disc):
  //   32 user + 32 oracle + 1 direction + 8 collateral + 8 notional + 1 leverage + 8 entry_price + 8 fee_paid + 8 timestamp
  //   notional at byte 82 (1-indexed), fee_paid at byte 99
  //
  // PositionClosed layout (after 8-byte disc):
  //   32 user + 32 oracle + 1 direction + 8 entry_price + 8 exit_price + 8 pnl + 8 funding_paid + 8 fee_paid + 8 settlement + 1 reason + 8 timestamp
  //   fee_paid at byte 106

  const query = `
    WITH events AS (
      SELECT
        data,
        bytearray_substring(data, 1, 8) as disc
      FROM solana.instruction_calls
      WHERE executing_account = '5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6'
        AND block_time >= TIMESTAMP '${options.startOfDay}'
        AND block_time < TIMESTAMP '${options.startOfDay}' + INTERVAL '1' DAY
    ),
    open_fees AS (
      SELECT bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 99, 8))) / 1e6 AS fee
      FROM events WHERE disc = 0xedaff3e693756579
    ),
    close_fees AS (
      SELECT bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 106, 8))) / 1e6 AS fee
      FROM events WHERE disc = 0x9da3e3e40d618a79
    ),
    open_volume AS (
      SELECT bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 82, 8))) / 1e6 AS notional
      FROM events WHERE disc = 0xedaff3e693756579
    )
    SELECT
      COALESCE((SELECT SUM(fee) FROM open_fees), 0) + COALESCE((SELECT SUM(fee) FROM close_fees), 0) AS total_fees,
      COALESCE((SELECT SUM(notional) FROM open_volume), 0) AS total_volume
  `;

  const result = await queryDuneSql(options, query);
  const row = result[0] || { total_fees: 0, total_volume: 0 };

  const fees = Number(row.total_fees) || 0;
  const volume = Number(row.total_volume) || 0;

  // Fee split: 50% to LP (supply side), 50% to protocol (25% insurance + 25% platform)
  dailyFees.addUSDValue(fees);
  dailyRevenue.addUSDValue(fees * 0.5);
  dailySupplySideRevenue.addUSDValue(fees * 0.5);

  return {
    dailyVolume: volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees (2% open + 2% close) collected from all position opens and closes, parsed from on-chain Anchor events.",
  Revenue: "50% of fees: 25% to protocol treasury + 25% to insurance fund.",
  SupplySideRevenue: "50% of fees distributed to liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-05-20",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
