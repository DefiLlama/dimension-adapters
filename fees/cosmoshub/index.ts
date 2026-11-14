import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const COSMOS_DECIMALS = 6;

// Gaia v18 upgrade height (LCD /cosmos/upgrade/v1beta1/applied_plan/v18), it added x/feemarket with
// distribute_fees = false (https://github.com/cosmos/gaia/blob/main/CHANGELOG.md, v18.0.0 "burn base fees"; prop 970 is the
// only feemarket param change since and kept it false). Since then the base fee stays in the feemarket-fee-collector module
// account and only the tip (fee minus ceil(base gas price x gas consumed)) goes to the block proposer (tip_pay event).
// - v18 to v19.1 (feemarket v1.0.3, SDK 0.47): the post handler ran on successful txs only, base fee payer -> module, tip payer -> proposer, failed txs paid nothing
// - since v19.1.0 (height 21835200, feemarket v1.1.0): the ante handler escrows the full fee into the module, the post handler pays
//   the tip out of it, a failed tx leaves its whole fee in the module (skip-mev/feemarket x/feemarket/ante/fee.go, post/fee.go)
// In both periods module inflow minus outflow is the fee kept and tip_pay is the proposer's cut.
// Allium cosmos.raw.transactions.fee_amount is the fee_pay base fee since v18 (no tip, null for failed txs), so it is only used before v18.
const FEEMARKET_HEIGHT = 21330500;
const FEEMARKET_MODULE = 'cosmos13pxn9n3qw79e03844rdadagmg0nshmwf7qvuye';

const COMMUNITY_TAX_BEFORE_PROP_88 = 0.02;
const COMMUNITY_TAX_AFTER_PROP_88 = 0.10;
const PROP_88_HEIGHT = 13315659;

const fetch = async (options: FetchOptions) => {
  const start = new Date(options.fromTimestamp * 1000).toISOString()
  const end = new Date(options.toTimestamp * 1000).toISOString()
  const timeFilter = `block_timestamp >= '${start}' AND block_timestamp < '${end}'`

  const query = `
    WITH txs AS (
      SELECT
        coalesce(sum(case when block_height < ${PROP_88_HEIGHT} then fee_amount end), 0) as legacy_fees_before_prop_88,
        coalesce(sum(case when block_height >= ${PROP_88_HEIGHT} and block_height < ${FEEMARKET_HEIGHT} then fee_amount end), 0) as legacy_fees_after_prop_88,
        max(block_height) as tx_max_height,
        -- every successful tx since v18 emits a tip_pay event (also for a zero tip), failed txs emit none
        count_if(code = 0 and block_height >= ${FEEMARKET_HEIGHT}) as tipped_txs
      FROM cosmos.raw.transactions
      WHERE ${timeFilter}
    ), coin_events AS (
      SELECT
        event_type,
        max(case when key in ('receiver', 'spender') then value end) as account,
        max(case when key = 'amount' then value end) as amount
      FROM cosmos.raw.event_attributes
      WHERE ${timeFilter}
        AND block_height >= ${FEEMARKET_HEIGHT}
        AND event_type in ('coin_received', 'coin_spent')
      GROUP BY block_height, coalesce(transaction_hash, ''), event_index, event_type
    ), module_flows AS (
      SELECT
        coalesce(sum(case when event_type = 'coin_received' then TRY_TO_NUMBER(REPLACE(amount, 'uatom', '')) end), 0) as module_in,
        coalesce(sum(case when event_type = 'coin_spent' then TRY_TO_NUMBER(REPLACE(amount, 'uatom', '')) end), 0) as module_out,
        count_if(TRY_TO_NUMBER(REPLACE(amount, 'uatom', '')) IS NULL) as bad_flows
      FROM coin_events
      WHERE account = '${FEEMARKET_MODULE}'
    ), tips AS (
      SELECT
        coalesce(sum(TRY_TO_NUMBER(REPLACE(value, 'uatom', ''))), 0) as tips,
        count_if(TRY_TO_NUMBER(REPLACE(value, 'uatom', '')) IS NULL) as bad_tips,
        count(*) as tip_events
      FROM cosmos.raw.event_attributes
      WHERE ${timeFilter}
        AND block_height >= ${FEEMARKET_HEIGHT}
        AND event_type = 'tip_pay'
        AND key = 'tip'
    )
    SELECT * FROM txs CROSS JOIN module_flows CROSS JOIN tips
  `;

  const [row] = await queryAllium(query);
  // the hub never has an hour without txs, an empty window means Allium has not indexed it yet
  if (!row || row.tx_max_height == null) throw new Error(`cosmoshub no transactions indexed for ${start} - ${end}`)
  if (Number(row.bad_tips) > 0) throw new Error(`cosmoshub ${row.bad_tips} tip_pay values are not plain uatom amounts`)
  if (Number(row.bad_flows) > 0) throw new Error(`cosmoshub ${row.bad_flows} feemarket module transfers are not plain uatom amounts`)
  if (Number(row.tip_events) !== Number(row.tipped_txs))
    throw new Error(`cosmoshub ${row.tipped_txs} successful txs but ${row.tip_events} tip_pay events, event_attributes is incomplete`)

  const legacyFees = Number(row.legacy_fees_before_prop_88) + Number(row.legacy_fees_after_prop_88)
  const communityPoolFees = Number(row.legacy_fees_before_prop_88) * COMMUNITY_TAX_BEFORE_PROP_88 + Number(row.legacy_fees_after_prop_88) * COMMUNITY_TAX_AFTER_PROP_88
  const keptFees = Number(row.module_in) - Number(row.module_out)
  const tips = Number(row.tips)
  if (keptFees < 0) throw new Error(`cosmoshub feemarket module paid out ${-keptFees} uatom more than it received`)

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addCGToken('cosmos', (legacyFees + keptFees + tips) / 10 ** COSMOS_DECIMALS, 'Transaction Fees');
  dailyRevenue.addCGToken('cosmos', communityPoolFees / 10 ** COSMOS_DECIMALS, 'Transaction Fees To Community Pool');
  dailyRevenue.addCGToken('cosmos', keptFees / 10 ** COSMOS_DECIMALS, 'Base Fees Locked In Feemarket Module');
  dailyProtocolRevenue.addCGToken('cosmos', communityPoolFees / 10 ** COSMOS_DECIMALS, 'Transaction Fees To Community Pool');
  dailyHoldersRevenue.addCGToken('cosmos', keptFees / 10 ** COSMOS_DECIMALS, 'Base Fees Locked In Feemarket Module');
  dailySupplySideRevenue.addCGToken('cosmos', (legacyFees - communityPoolFees) / 10 ** COSMOS_DECIMALS, 'Transaction Fees To Validators');
  dailySupplySideRevenue.addCGToken('cosmos', tips / 10 ** COSMOS_DECIMALS, 'Tips To Block Proposers');

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Transaction fees paid by users for executing transactions on the Cosmos network, including the tip paid to the block proposer",
  Revenue: 'Transaction fees not paid to validators: before Gaia v18 the community tax share sent to the community pool, since v18 (July 2024) the base fee locked in the feemarket-fee-collector module account',
  ProtocolRevenue: 'Before Gaia v18 (July 2024) the community tax share of transaction fees went to the community pool: 2% until December 19, 2022, 10% after (prop 88). Since v18 fees no longer pass through the community tax',
  HoldersRevenue: 'Since Gaia v18 (July 2024) the base fee of every tx, and since v19.1 (August 2024) the whole fee of failed txs, is locked in the feemarket-fee-collector module account (distribute_fees = false), a soft burn that takes it out of circulation without reducing total supply',
  SupplySideRevenue: 'Before Gaia v18 transaction fees minus the community tax went to validators and delegators, since v18 only the tip above the base fee goes to the block proposer',
}

const breakdownMethodology = {
  Fees: {
    'Transaction Fees': 'Transaction fees paid by users for executing transactions on the Cosmos network, including the tip paid to the block proposer',
  },
  Revenue: {
    'Transaction Fees To Community Pool': 'Community tax share of transaction fees before Gaia v18 (block 21330500), sent to the community pool: 2% until prop 88 (block 13315659), 10% after',
    'Base Fees Locked In Feemarket Module': 'Since Gaia v18, fees received by the feemarket-fee-collector module account minus the tips it pays out: the base fee (base gas price x gas consumed) of successful txs, plus the whole fee of failed txs since v19.1',
  },
  ProtocolRevenue: {
    'Transaction Fees To Community Pool': 'Community tax share of transaction fees before Gaia v18 (block 21330500), sent to the community pool: 2% until prop 88 (block 13315659), 10% after',
  },
  HoldersRevenue: {
    'Base Fees Locked In Feemarket Module': 'Since Gaia v18, the base fee of successful txs plus the whole fee of failed txs since v19.1, locked in the feemarket-fee-collector module account, which no tx can move funds out of (soft burn)',
  },
  SupplySideRevenue: {
    'Transaction Fees To Validators': 'Transaction fees before Gaia v18 (block 21330500) minus the community tax, distributed to validators and delegators',
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
