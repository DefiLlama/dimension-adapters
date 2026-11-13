import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const COSMOS_DECIMALS = 6;

// Gaia v18 upgrade height (LCD /cosmos/upgrade/v1beta1/applied_plan/v18), it added x/feemarket with
// distribute_fees = false (https://github.com/cosmos/gaia/blob/main/CHANGELOG.md, v18.0.0 "burn base fees").
// Since then the whole tx fee lands in the feemarket-fee-collector module account
// cosmos13pxn9n3qw79e03844rdadagmg0nshmwf7qvuye, only the tip (fee minus base fee) is paid out to the
// block proposer (tip_pay event), and the base fee stays locked in that account (skip-mev/feemarket x/feemarket/post/fee.go).
const FEEMARKET_HEIGHT = 21330500;

const fetch = async (options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()

  const query = `
    WITH txs AS (
      SELECT
        coalesce(sum(fee_amount), 0) as tx_fees,
        coalesce(sum(case when block_height >= ${FEEMARKET_HEIGHT} then fee_amount end), 0) as feemarket_fees,
        max(block_height) as tx_max_height,
        -- every successful tx since v18 emits a tip_pay event (also for a zero tip), failed txs emit none
        count_if(code = 0 and block_height >= ${FEEMARKET_HEIGHT}) as tipped_txs
      FROM cosmos.raw.transactions
      where block_timestamp >= '${start}' AND block_timestamp < '${end}'
        -- txs rejected by the ante handler (e.g. code 30 timeout height) are in the block but pay no fee and emit no events
        AND coalesce(event_count, 1) > 0
    ), tips AS (
      SELECT
        coalesce(sum(TRY_TO_NUMBER(REPLACE(TRIM(value, '"'), 'uatom', ''))), 0) as tips,
        count_if(TRY_TO_NUMBER(REPLACE(TRIM(value, '"'), 'uatom', '')) IS NULL) as bad_tips,
        count(*) as tip_events
      FROM cosmos.raw.event_attributes
      where block_timestamp >= '${start}' AND block_timestamp < '${end}'
        AND block_height >= ${FEEMARKET_HEIGHT}
        AND event_type = 'tip_pay'
        AND key = 'tip'
    )
    SELECT * FROM txs CROSS JOIN tips
  `;

  const [row] = await queryAllium(query);
  // the hub never has an hour without txs, an empty window means Allium has not indexed it yet
  if (!row || row.tx_max_height == null) throw new Error(`cosmoshub no transactions indexed for ${start} - ${end}`)
  if (Number(row.bad_tips) > 0) throw new Error(`cosmoshub ${row.bad_tips} tip_pay values are not plain uatom amounts`)
  const txFees = Number(row.tx_fees)
  const feemarketFees = Number(row.feemarket_fees)
  const tips = Number(row.tips)

  if (Number(row.tip_events) !== Number(row.tipped_txs))
    throw new Error(`cosmoshub ${row.tipped_txs} successful txs but ${row.tip_events} tip_pay events, event_attributes is incomplete`)
  if (tips > feemarketFees) throw new Error(`cosmoshub tips ${tips} exceed fees ${feemarketFees}`)

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addCGToken('cosmos', txFees / 10 ** COSMOS_DECIMALS, 'Transaction Fees');
  dailyRevenue.addCGToken('cosmos', (feemarketFees - tips) / 10 ** COSMOS_DECIMALS, 'Base Fees Locked In Feemarket Module');
  dailySupplySideRevenue.addCGToken('cosmos', (txFees - feemarketFees) / 10 ** COSMOS_DECIMALS, 'Transaction Fees To Validators');
  dailySupplySideRevenue.addCGToken('cosmos', tips / 10 ** COSMOS_DECIMALS, 'Tips To Block Proposers');

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Transaction fees paid by users for executing transactions on the Cosmos network",
  Revenue: 'Since Gaia v18 the base fee of every tx is kept in the feemarket-fee-collector module account (distribute_fees = false), it is not paid to validators',
  HoldersRevenue: 'None of the transaction fees are distributed to holders or burnt from supply, the base fee is locked in a module account',
  SupplySideRevenue: 'Before Gaia v18 all transaction fees went to validators and delegators, since v18 only the tip above the base fee goes to the block proposer',
}

const breakdownMethodology = {
  Fees: {
    'Transaction Fees': 'Transaction fees paid by users for executing transactions on the Cosmos network',
  },
  Revenue: {
    'Base Fees Locked In Feemarket Module': 'Tx fees minus proposer tips since Gaia v18, i.e. the base fee (base gas price x gas consumed), kept in the feemarket-fee-collector module account',
  },
  SupplySideRevenue: {
    'Transaction Fees To Validators': 'Transaction fees before Gaia v18 (block 21330500), distributed to validators and delegators',
    'Tips To Block Proposers': 'Tip (fee minus base fee) paid to the block proposer since Gaia v18, from tip_pay events',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.COSMOS],
  start: '2021-02-18',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;
