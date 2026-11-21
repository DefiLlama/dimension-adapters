import * as sdk from "@defillama/sdk";
import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const SEQUENCER_FEE_VAULT = '0x4200000000000000000000000000000000000011'; // block coinbase, collects priority fees
const BASE_FEE_VAULT = '0x4200000000000000000000000000000000000019';
const L1_FEE_VAULT = '0x420000000000000000000000000000000000001a';
const OPERATOR_FEE_VAULT = '0x420000000000000000000000000000000000001b';
const FEE_VAULTS = [SEQUENCER_FEE_VAULT, BASE_FEE_VAULT, L1_FEE_VAULT, OPERATOR_FEE_VAULT];

const BATCHER = '0xb98c6b1a805b96707a43e1f1acfa163b68098fa6';
const PROPOSER = '0x6644d495d22b0d25e904098d61520c95befc8ec5';

const L1_DATA_FEES = 'L1 Data Fees';
const OPERATOR_FEES = 'Transaction Operator Fees';
const L1_BATCH_POSTING_COSTS = 'Ethereum L1 Batch Posting Costs';
const L1_STATE_ROOT_COSTS = 'Ethereum L1 State Root Proposal Costs';
const FEES_NET_OF_L1_COSTS = 'Transaction Fees Net Of L1 Costs';

// MegaETH ran its own load against mainnet before the public launch
const TEAM_LOAD_TEST_WINDOWS = [
  ['2026-01-18', '2026-01-19'],
  ['2026-01-20', '2026-01-30'],
].map(([from, to]) => [Date.parse(from) / 1e3, Date.parse(to) / 1e3]);

const fetch = async (options: FetchOptions) => {
  const windowLastSecond = options.endTimestamp - 1;
  if (TEAM_LOAD_TEST_WINDOWS.some(([from, to]) => windowLastSecond >= from && windowLastSecond < to))
    throw new Error(`MegaETH team stress test on ${options.dateString}: vault inflows are team-paid load, not user fees`);

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const [fromBalances, toBalances, fromProcessed, toProcessed, l1Costs] = await Promise.all([
    sdk.api2.eth.getBalances({ targets: FEE_VAULTS, chain: options.chain, block: fromBlock }),
    sdk.api2.eth.getBalances({ targets: FEE_VAULTS, chain: options.chain, block: toBlock }),
    options.fromApi.multiCall({ abi: 'uint256:totalProcessed', calls: FEE_VAULTS }),
    options.toApi.multiCall({ abi: 'uint256:totalProcessed', calls: FEE_VAULTS }),
    queryAllium(`
      SELECT
        TO_VARCHAR(COALESCE(SUM(IFF(from_address = '${BATCHER}', receipt_gas_used * receipt_effective_gas_price
          + COALESCE(receipt_blob_gas_used, 0) * COALESCE(receipt_blob_gas_price, 0), 0)), 0)) AS batch_posting_wei,
        TO_VARCHAR(COALESCE(SUM(IFF(from_address = '${PROPOSER}', receipt_gas_used * receipt_effective_gas_price, 0)), 0)) AS state_root_wei,
        (SELECT COUNT(*) FROM ethereum.raw.transactions
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp})
            AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 60})) AS txs_after_window
      FROM ethereum.raw.transactions
      WHERE from_address IN ('${BATCHER}', '${PROPOSER}')
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `),
  ]);

  const costs = l1Costs?.[0];
  if (!costs || !(Number(costs.txs_after_window) > 0))
    throw new Error(`Allium has not indexed Ethereum past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);

  const balanceOf = (balances: { output: { target: string, balance: string }[] }, vault: string) =>
    BigInt(balances.output.find((b) => b.target.toLowerCase() === vault)!.balance);
  const collected = (vault: string) => {
    const i = FEE_VAULTS.indexOf(vault);
    return balanceOf(toBalances, vault) + BigInt(toProcessed[i]) - balanceOf(fromBalances, vault) - BigInt(fromProcessed[i]);
  };
  const operatorFeesWithdrawn = BigInt(toProcessed[FEE_VAULTS.indexOf(OPERATOR_FEE_VAULT)]) - BigInt(fromProcessed[FEE_VAULTS.indexOf(OPERATOR_FEE_VAULT)]);

  const baseFees = collected(BASE_FEE_VAULT) - operatorFeesWithdrawn;
  const priorityFees = collected(SEQUENCER_FEE_VAULT);
  const l1DataFees = collected(L1_FEE_VAULT);
  const operatorFees = collected(OPERATOR_FEE_VAULT);

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(baseFees, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addGasToken(priorityFees, METRIC.TRANSACTION_PRIORITY_FEES);
  dailyFees.addGasToken(l1DataFees, L1_DATA_FEES);
  dailyFees.addGasToken(operatorFees, OPERATOR_FEES);

  const batchPostingCost = BigInt(costs.batch_posting_wei);
  const stateRootCost = BigInt(costs.state_root_wei);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addGasToken(batchPostingCost, L1_BATCH_POSTING_COSTS);
  dailySupplySideRevenue.addGasToken(stateRootCost, L1_STATE_ROOT_COSTS);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addGasToken(baseFees + priorityFees + l1DataFees + operatorFees - batchPostingCost - stateRootCost, FEES_NET_OF_L1_COSTS);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
};

const feeLabels = {
  [METRIC.TRANSACTION_BASE_FEES]: 'Base fees paid by users, collected in the BaseFeeVault.',
  [METRIC.TRANSACTION_PRIORITY_FEES]: 'Priority fees paid by users, collected in the SequencerFeeVault.',
  [L1_DATA_FEES]: 'L1 data fee charged on each transaction towards the cost of posting its data, collected in the L1FeeVault.',
  [OPERATOR_FEES]: 'Operator fee charged on each transaction, collected in the OperatorFeeVault (MegaETH has charged none so far).',
};

const costLabels = {
  [L1_BATCH_POSTING_COSTS]: 'Ethereum gas paid by the MegaETH batcher to post the EigenDA certificate of each batch to the L1 batch inbox (plus blob fees, should the batcher ever post blobs).',
  [L1_STATE_ROOT_COSTS]: 'Ethereum gas paid by the MegaETH proposer to propose state roots through the Kailua contracts and resolve them.',
};

const revenueLabels = {
  [FEES_NET_OF_L1_COSTS]: 'Base, priority, L1 data and operator fees collected in the fee vaults, minus the Ethereum gas paid by the MegaETH batcher to post batch data and by the proposer to propose and resolve state roots.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: '2025-11-13',
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  allowNegativeValue: true, // revenue goes negative in an hour where the Ethereum gas paid by the batcher and proposer exceeds the fees collected
  methodology: {
    Fees: 'Transaction fees paid by users on MegaETH (base fees, priority fees and the L1 data fee), measured as the ETH collected by the chain\'s fee vaults; days of the team-run January 2026 stress test are not reported.',
    Revenue: 'Transaction fees minus the ETH MegaETH pays on Ethereum to post batch data and propose state roots; EigenDA data availability is paid off-chain and is not deducted.',
    SupplySideRevenue: 'Ethereum gas paid by the MegaETH batcher to post batch data and by the proposer to propose and resolve state roots.',
    ProtocolRevenue: 'All revenue is withdrawn from the fee vaults to the MegaETH multisig.',
  },
  breakdownMethodology: {
    Fees: feeLabels,
    Revenue: revenueLabels,
    ProtocolRevenue: revenueLabels,
    SupplySideRevenue: costLabels,
  },
};

export default adapter;
