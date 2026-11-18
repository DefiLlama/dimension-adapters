import { Interface, ZeroAddress } from 'ethers';
import { FetchOptions } from '../../../adapters/types';
import { getAlliumChain } from '../../allium';
import { EvmRoutes, FEE_WALLET, fusionXStocks, startTimestamp } from './config';
import {
  Amount, Call, EvmTradeTx, TraceRow, Transfer, indexedRows, nativeToken, netPaid,
  readEvmTransactions, sqlList, sumTransfers, timeRange, topicAddress, transfers, transferTopic,
} from './evm-data';

const classic = new Interface([
  'function swap(address executor, (address srcToken,address dstToken,address srcReceiver,address dstReceiver,uint256 amount,uint256 minReturnAmount,uint256 flags) desc, bytes data)',
]);
const classicSelector = classic.getFunction('swap')!.selector;

const okxOrder = 'event OrderRecord(address fromToken, address toToken, address sender, uint256 fromAmount, uint256 returnAmount)';
const okxCommissions = ['From', 'To'].flatMap(side => [
  `event Commission${side}TokenRecord(address token, uint256 amount, address referrer)`,
  `event Commission${side}TokenRecord(address token, uint256 amount, address referrer, uint256 rate)`,
]);

const abi = new Interface([
  okxOrder,
  ...okxCommissions,
  'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)',
  'event OrderFilled(bytes32 orderHash, uint256 remainingAmount)',
  'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)',
]);
const commissionTopics = new Map(okxCommissions.map(event => {
  const fragment = abi.getEvent(event)!;
  return [fragment.topicHash, fragment] as const;
}));
// EntryPoint v0.6/v0.7/v0.8 deployed at canonical addresses.
const entryPoints = new Set([
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
  '0x4337084d9e255ff0702461cf8895ce9e3b5ff108',
]);
// Ethereum Limit Order Protocol v4 emits OrderFilled for Fusion settlements.
const limitOrderProtocol = '0x111111125421ca6dc452d289314280a0f8842a65';

export type Swap = { volume?: Amount; fees: Amount[] };
type TransactionActor = { payer: string; userOperation: boolean; sponsored: boolean };

function feePayments(movements: Transfer[], payer: string): Amount[] {
  return movements
    .filter(item => item.from === payer && item.to === FEE_WALLET && item.amount > 0n)
    .map(({ token, amount }) => ({ token, amount }));
}

function transactionActor(tx: EvmTradeTx): TransactionActor | undefined {
  if (!entryPoints.has(tx.transaction.to)) return { payer: tx.transaction.from, userOperation: false, sponsored: false };
  const events = tx.logs.filter(log =>
    log.address === tx.transaction.to && log.topics[0] === abi.getEvent('UserOperationEvent')!.topicHash);
  if (events.length !== 1) return;
  const args = abi.decodeEventLog('UserOperationEvent', events[0].data, events[0].topics);
  // Verified Wallet V operations can have no paymaster and charge zero gas while
  // the router commission includes gas reimbursement. Keep these fees excluded.
  // https://polygon.blockscout.com/tx/0x8eae72960e83fe9fac8ccaaa49990a1dd2da26213d6040c22e9a65443b2d9dc3
  if (args.success) return {
    payer: args.sender.toLowerCase(), userOperation: true,
    sponsored: args.paymaster !== ZeroAddress || args.actualGasCost === 0n,
  };
}

function classicSwap(tx: EvmTradeTx, router: string, actor: TransactionActor, movements: Transfer[]): Swap | undefined {
  const outer = tx.transaction;
  let calls: Call[];
  if (outer.to === router) {
    calls = [{ from: outer.from, to: outer.to, input: outer.data, value: outer.value }];
  } else {
    calls = tx.calls.filter(call => call.to === router && call.from === actor.payer && call.input.startsWith(classicSelector));
  }
  if (calls.length !== 1 || !calls[0].input.startsWith(classicSelector)) return;
  const call = calls[0];
  const { executor, desc, data } = classic.decodeFunctionData('swap', call.input);
  if (!data.toLowerCase().includes(FEE_WALLET.slice(2))) return;
  const receiver = desc.dstReceiver.toLowerCase();
  if (receiver === FEE_WALLET || executor.toLowerCase() === FEE_WALLET) return;

  const token = nativeToken(desc.srcToken);
  const outputToken = nativeToken(desc.dstToken);
  if (token === outputToken) return;
  const fees = feePayments(movements, executor.toLowerCase());
  if (!fees.length) return;

  let amount = netPaid(movements, token, actor.payer);
  // Root traces are absent on some chains. The call value is the native
  // debit, and explicit native refunds reduce the amount actually paid.
  if (token === ZeroAddress) {
    const refunds = sumTransfers(movements, item => item.token === ZeroAddress && item.to === actor.payer);
    amount = call.value - refunds;
  }
  // AggregationRouterV6 GenericRouter defines _PARTIAL_FILL as bit 0 (1 << 0).
  // https://etherscan.io/address/0x111111125421ca6dc452d289314280a0f8842a65#code
  const partialFillAllowed = (desc.flags & 1n) !== 0n;
  const confirmed = amount > 0n && amount <= desc.amount && (amount === desc.amount || partialFillAllowed);
  return {
    volume: confirmed ? { token, amount } : undefined,
    fees: actor.sponsored ? [] : fees,
  };
}

function okxSwap(tx: EvmTradeTx, router: string, actor: TransactionActor, movements: Transfer[]): Swap | undefined {
  const logs = tx.logs.filter(log => log.address === router);
  const orders = logs.filter(log => log.topics[0] === abi.getEvent('OrderRecord')!.topicHash);
  if (orders.length !== 1) return;
  const order = abi.decodeEventLog('OrderRecord', orders[0].data, orders[0].topics);
  const token = nativeToken(order.fromToken);
  const outputToken = nativeToken(order.toToken);
  if (token === outputToken) return;

  let amount: bigint = order.fromAmount;
  const commissions = new Map<string, bigint>();
  for (const log of logs) {
    const fragment = commissionTopics.get(log.topics[0]);
    if (!fragment) continue;
    const commission = abi.decodeEventLog(fragment, log.data, log.topics);
    const feeToken = nativeToken(commission.token);
    if (fragment.name === 'CommissionFromTokenRecord' && feeToken === token) amount += commission.amount;
    if (commission.referrer.toLowerCase() === FEE_WALLET) {
      commissions.set(feeToken, (commissions.get(feeToken) ?? 0n) + commission.amount);
    }
  }
  if (!commissions.size) return;

  const fees: Amount[] = [];
  for (const [feeToken, feeAmount] of commissions) {
    const paidToWallet = sumTransfers(movements, item => item.token === feeToken && item.to === FEE_WALLET);
    const commissionPaid = sumTransfers(movements, item =>
      item.token === feeToken && item.from === router && item.to === FEE_WALLET);
    if (feeAmount <= 0n || feeAmount !== commissionPaid || paidToWallet !== commissionPaid) return;
    fees.push({ token: feeToken, amount: feeAmount });
  }
  if (!commissions.has(outputToken) &&
    movements.some(item => item.token === outputToken && item.to === FEE_WALLET)) return;

  const paid = token === ZeroAddress && !actor.userOperation
    ? tx.transaction.value - sumTransfers(movements, item => item.token === ZeroAddress && item.to === actor.payer)
    : netPaid(movements, token, actor.payer);
  // A native OKX input on an EntryPoint call can be funded internally; use
  // the proven OrderRecord and source commissions for that call.
  if (token !== ZeroAddress || !actor.userOperation) {
    const difference = paid - amount;
    // This native-input sample leaves a 1-wei rounding remainder. Allow only that exact difference.
    // https://bscscan.com/tx/0x32f28db8c5842531655c7862fb96cbc0567d5faad508a4010105e84d00ada487
    if (difference !== 0n && !(token === ZeroAddress && difference === 1n)) {
      return { fees: actor.sponsored ? [] : fees };
    }
    amount = paid;
  }
  return { volume: amount > 0n ? { token, amount } : undefined, fees: actor.sponsored ? [] : fees };
}

function kyberSwap(tx: EvmTradeTx, router: string, sponsored: boolean, movements: Transfer[]): Swap | undefined {
  const events = tx.logs.filter(log => log.address === router && log.topics[0] === abi.getEvent('Swapped')!.topicHash);
  if (events.length !== 1) return;
  const args = abi.decodeEventLog('Swapped', events[0].data, events[0].topics);
  if (args.sender.toLowerCase() === FEE_WALLET || args.dstReceiver.toLowerCase() === FEE_WALLET) return;
  const fees = feePayments(movements, router);
  if (!fees.length) return;
  const token = nativeToken(args.srcToken);
  const amount: bigint = args.spentAmount;
  return {
    volume: amount > 0n && token !== nativeToken(args.dstToken) ? { token, amount } : undefined,
    fees: sponsored ? [] : fees,
  };
}

function fusionSwap(tx: EvmTradeTx, settlement: string, movements: Transfer[]): Swap | undefined {
  const fills = tx.logs.filter(log =>
    log.address === limitOrderProtocol && log.topics[0] === abi.getEvent('OrderFilled')!.topicHash);
  if (fills.length !== 1) return;
  const fees = feePayments(movements, settlement);
  if (!fees.length) return;

  // The maker pays the input and receives the settlement proceeds. This
  // separates the maker from the solver, integrator and partner recipients.
  const makers = new Map<string, Amount>();
  for (const payment of movements) {
    if (payment.from !== settlement || payment.to === FEE_WALLET || payment.to === ZeroAddress || payment.amount <= 0n) continue;
    const maker = payment.to;
    const inputTokens = new Set(movements.filter(item => item.from === maker && item.token !== payment.token
      && item.token !== ZeroAddress && item.amount > 0n).map(item => item.token));
    if (inputTokens.size !== 1) continue;
    const token = Array.from(inputTokens)[0];
    if (!fusionXStocks.has(token) && !fusionXStocks.has(payment.token)) continue;
    const amount = netPaid(movements, token, maker);
    if (amount > 0n) makers.set(maker, { token, amount });
  }
  if (makers.size !== 1) return;
  return { volume: Array.from(makers.values())[0], fees };
}

/** Decode one verified user swap, excluding ambiguous multi-route transactions. */
export function decodeEvmSwap(tx: EvmTradeTx, routes: EvmRoutes): Swap | undefined {
  const actor = transactionActor(tx);
  if (!actor || actor.payer === FEE_WALLET || tx.transaction.from === FEE_WALLET) return;
  const movements = transfers(tx.logs);
  for (const call of tx.calls) {
    if (call.value > 0n) movements.push({ token: ZeroAddress, from: call.from, to: call.to, amount: call.value });
  }
  const matches = [classicSwap(tx, routes.classic, actor, movements)];
  if (routes.okx && tx.timestamp >= startTimestamp(routes.okx.start)) {
    matches.push(okxSwap(tx, routes.okx.router, actor, movements));
  }
  if (routes.kyber && tx.timestamp >= startTimestamp(routes.kyber.start)) {
    matches.push(kyberSwap(tx, routes.kyber.router, actor.sponsored, movements));
  }
  if (routes.fusion && tx.timestamp >= startTimestamp(routes.fusion.start)) {
    matches.push(fusionSwap(tx, routes.fusion.settlement, movements));
  }
  const verified = matches.filter((item): item is Swap => !!item);
  if (verified.length === 1) return verified[0];
}

/** Discover both ERC-20 and native payments, and retain their original router calls. */
export async function readEvmSwaps(options: FetchOptions, routes: EvmRoutes): Promise<Swap[]> {
  const schema = `${getAlliumChain(options.chain)}.raw`;
  const from = Math.max(options.startTimestamp, startTimestamp(routes.start));
  const end = options.endTimestamp;
  if (from >= end) return [];
  const knownPayers = [routes.okx?.router, routes.kyber?.router, routes.fusion?.settlement].filter((address): address is string => !!address);
  const routerCalls = `t.to_address = '${routes.classic}' AND t.selector = '${classicSelector}'`;
  const knownPayer = (field: string) => knownPayers.length ? `${field} IN (${sqlList(knownPayers)})` : 'FALSE';
  const rows = await indexedRows<TraceRow>(`
    incoming AS (
      SELECT transaction_hash AS tx_hash, block_timestamp, '0x' || RIGHT(topic1, 40) AS payer,
        to_address AS transaction_target
      FROM ${schema}.logs
      WHERE ${timeRange(from, end)}
        AND topic0 = '${transferTopic}' AND topic2 = '${topicAddress(FEE_WALLET)}'
        AND topic3 IS NULL AND LENGTH(data) = 66
      UNION ALL
      SELECT transaction_hash AS tx_hash, block_timestamp, from_address AS payer, NULL AS transaction_target
      FROM ${schema}.traces
      WHERE ${timeRange(from, end)} AND to_address = '${FEE_WALLET}'
        AND status = 1 AND error IS NULL AND call_type = 'call' AND value > 0
    ),
    candidates AS (
      SELECT tx_hash, block_timestamp FROM incoming
      WHERE transaction_target = '${routes.classic}' OR ${knownPayer('payer')}
      UNION
      SELECT tx.hash AS tx_hash, tx.block_timestamp
      FROM ${schema}.transactions tx
      JOIN incoming i ON i.tx_hash = tx.hash
      WHERE ${timeRange(from, end, 'tx.')} AND tx.to_address = '${routes.classic}'
      UNION
      SELECT t.transaction_hash AS tx_hash, t.block_timestamp
      FROM ${schema}.traces t
      JOIN incoming i ON i.tx_hash = t.transaction_hash
      WHERE ${timeRange(from, end, 't.')} AND t.status = 1 AND t.error IS NULL AND t.call_type = 'call'
        AND ${routerCalls}
    )`, `
    SELECT c.tx_hash, DATE_PART(epoch_second, c.block_timestamp) AS timestamp,
      t.from_address, t.to_address, t.input, t.value::VARCHAR AS value_raw
    FROM candidates c
    LEFT JOIN ${schema}.traces t ON t.transaction_hash = c.tx_hash
      AND ${timeRange(from, end, 't.')} AND t.status = 1 AND t.error IS NULL AND t.call_type = 'call'
      AND (t.value > 0 OR (${routerCalls}))
  `, [`${schema}.logs`, `${schema}.traces`, `${schema}.transactions`], end, options.chain);
  const transactions = await readEvmTransactions(options.chain, rows);
  return transactions.flatMap(tx => {
    const swap = decodeEvmSwap(tx, routes);
    return swap ? [swap] : [];
  });
}
