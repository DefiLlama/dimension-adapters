import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { fetchTransactionFees } from "../helpers/getChainFees";
import { METRIC } from "../helpers/metrics";

// Ronin hard-forked from a sidechain into an OP Stack rollup on Ethereum at block 55,577,490 (2026-05-12 ~15:16 UTC).
// Gas is still paid in RON, but Ronin now pays ETH on Ethereum to settle: the batcher posts the EigenDA certificate of
// each batch to the inbox 0x003A7A2d3129838Adb01c8d9b7DA62Ac6Ec27961 and the proposer creates dispute games on the
// DisputeGameFactory 0x45dA2CD511DA5FEAa535eBF166E628314a65843a and later resolves them. Both keys are unchanged since the
// migration; a silent batcher throws below, a rotated proposer key would drop out of the cost query. The fee vaults withdraw to 0x22cEfc91E9b7c0f3890eBf9527EA89053490694e
// on Ronin (recipient() of all three), and Ronin sends net sequencer profit to its treasury (blog.roninchain.com/p/ronin-is-home). The L1 data
// fee charged on Ronin is ~0 (0.0004 RON into the L1FeeVault on 2026-11-12), and EigenDA is paid off Ethereum, so neither
// is counted.
const L2_FROM = 1778601600 // 2026-05-12 16:00 UTC: the 15:00 hour holds the last sidechain blocks, the rollup produced blocks again from ~22:00
const HALT_FROM = 1778599036 // 2026-05-12 15:17:16 UTC: the migration halted Ronin, the last sidechain block any index serves is 55,577,501 at 15:17:15
const HALT_TO = 1778623200 // 2026-05-12 22:00 UTC: the first rollup block the RPC serves is 55,577,500 at 22:09:47
const BATCHER_CHECK_FROM = 1778716800 // 2026-05-14 00:00 UTC; the batcher has posted every ~10 minutes since 2026-05-12
const BATCHER_SILENCE = 24 * 3600 // no post in the day before a window's end means a rotated key or missing data
const BATCHER = '0x9aa8feacbb42659a806cdd6933ab3982586824f1' // L1Block.batcherHash() on Ronin
const PROPOSER = '0xd379de941e78ab394d4d4917fcce1cc45b6cd620' // creates and resolves the dispute games since the migration
const L1_BATCH_POSTING_COSTS = 'Ethereum L1 Batch Posting Costs'
const L1_STATE_ROOT_COSTS = 'Ethereum L1 State Root Proposal Costs'

const fetch = async (options: FetchOptions) => {
  // windows inside the migration halt have no Ronin transactions, which fetchTransactionFees reads as missing data.
  // HALT_FROM is the halt itself, not the L2_FROM cost cutoff, so windows ending HH:59:59 (16:59:59 starts at 15:59:59) are covered too
  const halted = options.startTimestamp >= HALT_FROM && options.endTimestamp <= HALT_TO
  const dailyFees = halted ? options.createBalances() : await fetchTransactionFees(options)
  if (options.endTimestamp <= L2_FROM) return { dailyFees, dailyRevenue: dailyFees.clone() }

  const [costs] = await queryAllium(`
    SELECT
      TO_VARCHAR(COALESCE(SUM(IFF(from_address = '${BATCHER}', receipt_gas_used * receipt_effective_gas_price
        + COALESCE(receipt_blob_gas_used, 0) * COALESCE(receipt_blob_gas_price, 0), 0)), 0)) AS batch_posting_wei,
      TO_VARCHAR(COALESCE(SUM(IFF(from_address = '${PROPOSER}', receipt_gas_used * receipt_effective_gas_price, 0)), 0)) AS state_root_wei,
      (SELECT COUNT(*) FROM ethereum.raw.transactions
        WHERE from_address = '${BATCHER}'
          AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp - BATCHER_SILENCE})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})) AS recent_batcher_txs,
      (SELECT COUNT(*) FROM ethereum.raw.transactions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
          AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 60})) AS txs_after_window
    FROM ethereum.raw.transactions
    WHERE from_address IN ('${BATCHER}', '${PROPOSER}')
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${Math.max(options.startTimestamp, L2_FROM)})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `)
  if (!costs || !(Number(costs.txs_after_window) > 0))
    throw new Error(`Allium has not indexed Ethereum past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`)
  if (options.startTimestamp >= BATCHER_CHECK_FROM && !(Number(costs.recent_batcher_txs) > 0))
    throw new Error(`ronin: batcher ${BATCHER} sent nothing to Ethereum in the 24 hours before ${new Date(options.endTimestamp * 1e3).toISOString()}`)

  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.addCGToken('ethereum', Number(costs.batch_posting_wei) / 1e18, L1_BATCH_POSTING_COSTS)
  dailySupplySideRevenue.addCGToken('ethereum', Number(costs.state_root_wei) / 1e18, L1_STATE_ROOT_COSTS)

  const dailyRevenue = dailyFees.clone()
  dailyRevenue.subtract(dailySupplySideRevenue, METRIC.TRANSACTION_GAS_FEES)
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.RONIN],
  start: '2025-02-05',
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // the ETH Ronin pays on Ethereum can exceed the RON gas fees of the window
  methodology: {
    Fees: 'Transaction fees paid by users on Ronin, in RON.',
    Revenue: 'From the 2026-05-12 hard fork (16:00 UTC) into an OP Stack rollup: transaction fees minus the ETH Ronin pays on Ethereum to post batches and propose state roots. EigenDA is paid off Ethereum and is not deducted. Before the hard fork, revenue is reported as all transaction fees, unchanged from the previous adapter; the sidechain-era validator share is not split out.',
    ProtocolRevenue: 'Net sequencer revenue, which goes to the Ronin treasury, from the 2026-05-12 hard fork.',
    SupplySideRevenue: 'ETH paid on Ethereum by the Ronin batcher to post batches and by the proposer to create and resolve dispute games, from the 2026-05-12 hard fork.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Gas used multiplied by the gas price, summed over every Ronin transaction.',
    },
    Revenue: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees net of the Ethereum batch posting and state root proposal costs.',
    },
    ProtocolRevenue: {
      [METRIC.TRANSACTION_GAS_FEES]: 'Transaction fees net of the Ethereum batch posting and state root proposal costs, kept by the Ronin treasury.',
    },
    SupplySideRevenue: {
      [L1_BATCH_POSTING_COSTS]: 'Ethereum gas paid by the Ronin batcher to post the EigenDA certificate of each batch to the L1 batch inbox (plus blob fees, should the batcher ever post blobs).',
      [L1_STATE_ROOT_COSTS]: 'Ethereum gas paid by the Ronin proposer to create dispute games on the DisputeGameFactory and resolve them.',
    },
  },
}

export default adapter;
