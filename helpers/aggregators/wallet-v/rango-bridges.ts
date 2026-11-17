import { createHash } from 'crypto';
import { Interface, ZeroAddress, toBeHex } from 'ethers';
import { FetchOptions } from '../../../adapters/types';
import { CHAIN } from '../../chains';
import { findProgramAddress } from '../../solana';
import { bridgeChains, FEE_WALLET, startTimestamp } from './config';
import {
  Amount, EvmCandidate, EvmTradeTx, TraceRow, indexedRows, nativeToken, readEvmTransactions,
  sqlList, timeRange, topicAddress, transfers,
} from './evm-data';

// Rango's EVM diamond and the Wallet V affiliate tag on the two supported corridors.
// https://docs.rango.exchange/smart-contracts/deployment-addresses
const rango = '0x69460570c93f9de5e2edbc3052bf10125f0ca22d';
const tag = toBeHex(1579, 32);
const affiliate = toBeHex(1, 32);
const oldFee = 'event FeeInfo(address token, address indexed affiliatorAddress, uint256 platformFee, uint256 destinationExecutorFee, uint256 affiliateFee, uint16 indexed dAppTag)';
const newFee = 'event FeeInfo(address token, address indexed affiliatorAddress, uint256 affiliateFee, uint8 indexed feeType, uint16 indexed dAppTag)';

const acrossOptimism = '0x6f26bf09b1c792e3228e5467807a900a503c0281';
const acrossArbitrum = '0xe35e9842fceaca96570b734083f4a58e8f7c5f2a';
const optimismChainId = 10n;
const arbitrumChainId = 42161n;
const deposits = [
  'event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)',
  'event V3FundsDeposited(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint32 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, address indexed depositor, address recipient, address exclusiveRelayer, bytes message)',
];
const fills = [
  'event FilledRelay(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 exclusiveRelayer, bytes32 indexed relayer, bytes32 depositor, bytes32 recipient, bytes32 messageHash, (bytes32,bytes32,uint256,uint8) relayExecutionInfo)',
  'event FilledV3Relay(address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint32 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, address exclusiveRelayer, address indexed relayer, address depositor, address recipient, bytes message, (address,bytes,uint256,uint8) relayExecutionInfo)',
];
// Swift v1 deployments used by the verified Ethereum to Solana orders.
// https://github.com/mayan-finance/swap-sdk
const swiftEthereum = '0xc38e4e6a15593f908255214653d3d947ca1c2338';
const swiftSolana = 'BLZRi6frs4X4DNLw56V4EXai1b6QVESN1BhHBTYM9VcY';
const solanaWormholeId = 1n;
const settleDiscriminator = createHash('sha256').update('global:settle').digest('hex').slice(0, 16);
const swiftParams = '(bytes32 trader, bytes32 tokenOut, uint64 minAmountOut, uint64 gasDrop, uint64 cancelFee, uint64 refundFee, uint64 deadline, bytes32 destAddr, uint16 destChainId, bytes32 referrerAddr, uint8 referrerBps, uint8 auctionMode, bytes32 random)';
const swiftFunctions = new Interface([
  `function createOrderWithEth(${swiftParams} params) payable returns (bytes32 orderHash)`,
  `function createOrderWithToken(address tokenIn, uint256 amountIn, ${swiftParams} params) returns (bytes32 orderHash)`,
]);
const swiftSelectors = ['createOrderWithEth', 'createOrderWithToken'].map(name => swiftFunctions.getFunction(name)!.selector);

const abi = new Interface([oldFee, newFee, ...deposits, ...fills, 'event OrderCreated(bytes32 orderHash)']);
const topic = (event: string) => abi.getEvent(event)!.topicHash;
const depositTopics = deposits.map(topic);
const fillTopics = fills.map(topic);

type BridgeOrder = Amount & { id: string; fees: Amount[] };
type SwiftOrder = EvmCandidate & { order_hash: string };
type AcrossFill = EvmCandidate & { deposit_id: string };

function feeSql(alias: string): string {
  return `${alias}.address = '${rango}' AND ${alias}.topic1 = '${topicAddress(FEE_WALLET)}'
    AND ((${alias}.topic0 = '${topic(oldFee)}' AND ${alias}.topic2 = '${tag}')
      OR (${alias}.topic0 = '${topic(newFee)}' AND ${alias}.topic2 = '${affiliate}' AND ${alias}.topic3 = '${tag}'))
    AND ${alias}.from_address <> '${FEE_WALLET}'`;
}

function rangoFees(tx: EvmTradeTx): Amount[] {
  return tx.logs.flatMap(log => {
    if (log.address !== rango || log.topics[1] !== topicAddress(FEE_WALLET)) return [];
    let event: string;
    if (log.topics[0] === topic(oldFee) && log.topics[2] === tag) event = oldFee;
    else if (log.topics[0] === topic(newFee) && log.topics[2] === affiliate && log.topics[3] === tag) event = newFee;
    else return [];
    const args = abi.decodeEventLog(abi.getEvent(event)!, log.data, log.topics);
    return args.affiliateFee > 0n ? [{ token: nativeToken(args.token), amount: args.affiliateFee }] : [];
  });
}

/** Read the actual Across SpokePool deposit amount from the source-chain receipt. */
export function decodeAcrossOrder(tx: EvmTradeTx): BridgeOrder | undefined {
  if (tx.transaction.from === FEE_WALLET) return;
  const fees = rangoFees(tx);
  const found = tx.logs.filter(log => log.address === acrossOptimism && depositTopics.includes(log.topics[0])
    && log.topics[1] === toBeHex(arbitrumChainId, 32));
  if (!fees.length || found.length !== 1) return;
  const log = found[0];
  const args = abi.decodeEventLog(abi.getEvent(log.topics[0])!, log.data, log.topics);
  if (args.inputAmount > 0n) return {
    id: toBeHex(args.depositId, 32),
    token: nativeToken('0x' + args.inputToken.slice(-40)),
    amount: args.inputAmount,
    fees,
  };
}

/** Read the escrowed principal and Solana destination from the Swift source call. */
export function decodeMayanOrder(tx: EvmTradeTx): BridgeOrder | undefined {
  if (tx.transaction.from === FEE_WALLET) return;
  const fees = rangoFees(tx);
  const fills = tx.logs.filter(log => log.address === swiftEthereum && log.topics[0] === topic('OrderCreated'));
  const calls = tx.calls.filter(call => call.to === swiftEthereum && swiftSelectors.includes(call.input.slice(0, 10)));
  if (!fees.length || fills.length !== 1 || calls.length !== 1) return;
  const call = calls[0];
  const order = swiftFunctions.parseTransaction({ data: call.input, value: call.value });
  if (!order || order.args.params.destChainId !== solanaWormholeId) return;

  const token = order.name === 'createOrderWithEth' ? ZeroAddress : nativeToken(order.args.tokenIn);
  const amount: bigint = token === ZeroAddress ? call.value : order.args.amountIn;
  if (amount <= 0n) return;
  // The ERC-20 amount must really have been deposited in the Swift contract.
  if (token !== ZeroAddress && !transfers(tx.logs).some(transfer =>
    transfer.token === token && transfer.from === call.from && transfer.to === swiftEthereum && transfer.amount === amount)) return;
  return {
    id: abi.decodeEventLog('OrderCreated', fills[0].data, fills[0].topics).orderHash,
    token, amount, fees,
  };
}

export const swiftState = (orderHash: string): string =>
  findProgramAddress([Buffer.from('STATE_DEST'), Buffer.from(orderHash.slice(2), 'hex')], swiftSolana)[0];

async function acrossSource(options: FetchOptions, findCompleted: boolean): Promise<AcrossFill[]> {
  const end = options.endTimestamp;
  const originStart = startTimestamp(bridgeChains[CHAIN.OPTIMISM].start);
  // Join destination fills to deposits across the entire supported source history.
  // A deposit created on a previous UTC date stays eligible for the fill day.
  const from = findCompleted ? originStart : Math.max(options.startTimestamp, originStart);
  if (from >= end) return [];
  const datasets = ['optimism.raw.logs'];
  if (findCompleted) datasets.push('arbitrum.raw.logs');
  const fillCte = findCompleted ? `, completed AS (
      SELECT topic2 AS deposit_id, block_timestamp AS filled_at,
        SUBSTR(data, 3, 64) || SUBSTR(data, 131, 64) AS input_asset_and_amount
      FROM arbitrum.raw.logs
      WHERE ${timeRange(options.startTimestamp, end)}
        AND address = '${acrossArbitrum}' AND topic0 IN (${sqlList(fillTopics)})
        AND topic1 = '${toBeHex(optimismChainId, 32)}'
    )` : '';
  return indexedRows<AcrossFill>(`
    wallet_txs AS (
      SELECT DISTINCT f.transaction_hash
      FROM optimism.raw.logs f
      WHERE ${timeRange(from, end, 'f.')} AND ${feeSql('f')}
    )${fillCte}`, `
    SELECT DISTINCT d.transaction_hash AS tx_hash, DATE_PART(epoch_second, d.block_timestamp) AS timestamp, d.topic2 AS deposit_id
    FROM optimism.raw.logs d
    JOIN wallet_txs w ON w.transaction_hash = d.transaction_hash
    ${findCompleted ? `JOIN completed c ON c.deposit_id = d.topic2 AND c.filled_at >= d.block_timestamp
      AND c.input_asset_and_amount = SUBSTR(d.data, 3, 64) || SUBSTR(d.data, 131, 64)` : ''}
    WHERE ${timeRange(from, end, 'd.')} AND d.address = '${acrossOptimism}'
      AND d.topic0 IN (${sqlList(depositTopics)}) AND d.topic1 = '${toBeHex(arbitrumChainId, 32)}'
  `, datasets, end, 'Across');
}

async function mayanSource(from: number, end: number): Promise<SwiftOrder[]> {
  return indexedRows<SwiftOrder>(`
    wallet_txs AS (
      SELECT DISTINCT f.transaction_hash
      FROM ethereum.raw.logs f
      WHERE ${timeRange(from, end, 'f.')} AND ${feeSql('f')}
    )`, `
    SELECT DISTINCT o.transaction_hash AS tx_hash, DATE_PART(epoch_second, o.block_timestamp) AS timestamp, o.data AS order_hash
    FROM ethereum.raw.logs o
    JOIN wallet_txs w ON w.transaction_hash = o.transaction_hash
    WHERE ${timeRange(from, end, 'o.')} AND o.address = '${swiftEthereum}' AND o.topic0 = '${topic('OrderCreated')}'
  `, ['ethereum.raw.logs'], end, 'Mayan orders');
}

async function mayanSettledOrders(options: FetchOptions, orders: SwiftOrder[]): Promise<SwiftOrder[]> {
  if (!orders.length) return [];
  const byState = new Map(orders.map(order => [swiftState(order.order_hash), order]));
  const states = Array.from(byState.keys());
  const end = options.endTimestamp;
  const filter = (alias = '') => `${timeRange(options.startTimestamp, end, alias)}
    AND ${alias}program_id = '${swiftSolana}' AND ${alias}data_hex_first16 = '${settleDiscriminator}'
    AND ${alias}accounts[0]::STRING IN (${sqlList(states)})`;
  const rows = await indexedRows<{ tx_hash: string; state: string }>(`
    settlements AS (
      SELECT txn_id, accounts[0]::STRING AS state
      FROM solana.raw.instructions
      WHERE ${filter()}
      UNION
      SELECT txn_id, accounts[0]::STRING AS state
      FROM solana.raw.inner_instructions
      WHERE ${filter()}
    )`, `
    SELECT DISTINCT s.txn_id AS tx_hash, s.state
    FROM settlements s
    JOIN solana.raw.transactions t ON t.txn_id = s.txn_id
    WHERE ${timeRange(options.startTimestamp, end, 't.')} AND t.success
  `, ['solana.raw.instructions', 'solana.raw.inner_instructions'], end, 'Mayan settlements');
  return Array.from(new Set(rows.map(row => row.state))).map(state => byState.get(state)!);
}

async function readMayanOrders(orders: SwiftOrder[], end: number): Promise<BridgeOrder[]> {
  if (!orders.length) return [];
  const from = Math.min(...orders.map(order => Number(order.timestamp)));
  const traceRows = await indexedRows<TraceRow>(`
    calls AS (
      SELECT transaction_hash AS tx_hash, DATE_PART(epoch_second, block_timestamp) AS timestamp,
        from_address, to_address, input, value::VARCHAR AS value_raw
      FROM ethereum.raw.traces
      WHERE ${timeRange(from, end)} AND to_address = '${swiftEthereum}'
        AND status = 1 AND error IS NULL AND call_type = 'call'
        AND transaction_hash IN (${sqlList(orders.map(order => order.tx_hash))})
    )`, 'SELECT * FROM calls', ['ethereum.raw.traces'], end, 'Mayan source traces');

  const traced = new Set(traceRows.map(row => row.tx_hash));
  const missing = orders.find(order => !traced.has(order.tx_hash));
  if (missing) throw new Error(`Wallet V Mayan: missing Swift trace for ${missing.tx_hash}`);
  // Some Swift entry points do not use the escrow formats supported here.
  // Without a decoded source call we cannot establish this corridor's principal.
  const expected = new Set(orders.map(order => order.order_hash.toLowerCase()));
  const transactions = await readEvmTransactions(CHAIN.ETHEREUM, traceRows);
  return transactions.flatMap(tx => {
    const order = decodeMayanOrder(tx);
    return order && expected.has(order.id.toLowerCase()) ? [order] : [];
  });
}

/** Report source-chain fees in their payment window and completed principal in the destination window. */
export async function readRangoBridge(options: FetchOptions, metric: 'fees' | 'volume'): Promise<Amount[]> {
  const chain = options.chain;
  const route = bridgeChains[chain];
  if (!route) return [];
  const end = options.endTimestamp;
  const start = startTimestamp(route.start);
  if (end <= start) return [];

  if (chain === CHAIN.OPTIMISM) {
    const rows = await acrossSource(options, metric === 'volume');
    const depositIds = new Set(rows.map(row => row.deposit_id));
    const transactions = await readEvmTransactions(chain, rows);
    const orders = transactions.flatMap(tx => {
      const order = decodeAcrossOrder(tx);
      return order && depositIds.has(order.id) ? [order] : [];
    });
    return metric === 'fees' ? orders.flatMap(order => order.fees) : orders;
  }

  let orders = await mayanSource(metric === 'fees' ? Math.max(options.startTimestamp, start) : start, end);
  if (metric === 'volume') orders = await mayanSettledOrders(options, orders);
  const decoded = await readMayanOrders(orders, end);
  return metric === 'fees' ? decoded.flatMap(order => order.fees) : decoded;
}
