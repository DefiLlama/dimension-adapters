import { CHAIN } from "../helpers/chains";
import { Adapter, ProtocolType, FetchOptions } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";

const ethereumWallets = [
  '0x5050F69a9786F081509234F1a7F4684b5E5b76C9',
  '0xff00000000000000000000000000000000008453',
  '0x642229f238fb9dE03374Be34B0eD8D9De80752c5',
  '0x56315b90c40730925ec5485cf004d835058518A0'
]

const fetch = async (options: FetchOptions) => {
  // Calculate tx gas fees, and calldata and blob costs from ethereum
  const query = `
    WITH total_tx_fees AS (
      SELECT
        SUM(tx_fee_raw/1e18) AS total_tx_fees
      FROM gas.fees
      WHERE blockchain = 'base'
      AND TIME_RANGE
    ),
    total_calldata_costs AS (
      SELECT
        SUM(t.gas_used * (CAST(t.gas_price AS DOUBLE) / 1e18)) AS calldata_cost
      FROM
        ethereum.transactions t
        INNER JOIN ethereum.blocks b ON t.block_number = b.number
      WHERE t.to IN (0x5050F69a9786F081509234F1a7F4684b5E5b76C9, 0xff00000000000000000000000000000000008453, 0x642229f238fb9dE03374Be34B0eD8D9De80752c5, 0x56315b90c40730925ec5485cf004d835058518A0)
      AND t.block_time >= from_unixtime(${options.startTimestamp})
      AND t.block_time <= from_unixtime(${options.endTimestamp})
    ),
    total_blob_costs AS (
      SELECT
        SUM((CAST(b.blob_base_fee AS DOUBLE) / 1e18) * b.blob_gas_used) AS blob_cost
      FROM ethereum.blobs_submissions b
      WHERE b.blob_submitter_label = 'Base'
        AND b.block_time >= from_unixtime(${options.startTimestamp})
        AND b.block_time <= from_unixtime(${options.endTimestamp})
    )
    SELECT
      COALESCE((SELECT total_tx_fees FROM total_tx_fees), 0) AS total_fee,
      COALESCE((SELECT calldata_cost FROM total_calldata_costs), 0) +
      COALESCE((SELECT blob_cost FROM total_blob_costs), 0) AS total_cost,
      (COALESCE((SELECT total_tx_fees FROM total_tx_fees), 0)) -
      (COALESCE((SELECT calldata_cost FROM total_calldata_costs), 0) +
       COALESCE((SELECT blob_cost FROM total_blob_costs), 0)) AS total_revenue
  `;
  const fees: any[] = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addGasToken(fees[0].total_fee * 1e18);
  dailyRevenue.addGasToken(fees[0].total_revenue * 1e18);

  return { dailyFees, dailyRevenue }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-06-23'
    },
  },
  protocolType: ProtocolType.CHAIN,
  allowNegativeValue: true, // calldata and blob costs
}

export default adapter;
