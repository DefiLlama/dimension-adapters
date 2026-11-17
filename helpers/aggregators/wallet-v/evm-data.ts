import { Balances } from '@defillama/sdk';
import { Interface, ZeroAddress, zeroPadValue } from 'ethers';
import { queryAllium } from '../../allium';
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from '../../getTxReceipts';

export type Amount = { token: string; amount: bigint };
export type Transfer = Amount & { from: string; to: string };
export type EvmLog = { address: string; topics: readonly string[]; data: string };
export type Call = { from: string; to: string; input: string; value: bigint };
export type EvmTradeTx = {
  hash: string;
  timestamp: number;
  transaction: { from: string; to: string; data: string; value: bigint };
  logs: EvmLog[];
  calls: Call[];
};

export const erc20 = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
export const transferTopic = erc20.getEvent('Transfer')!.topicHash;
export const topicAddress = (address: string) => zeroPadValue(address, 32).toLowerCase();
export const nativeToken = (token: string) => token.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
  ? ZeroAddress : token.toLowerCase();

export function addAmount(balances: Balances, { token, amount }: Amount, label?: string) {
  if (amount <= 0n) return;
  if (token === ZeroAddress) balances.addGasToken(amount, label);
  else balances.add(token, amount, label);
}

export function transfers(logs: EvmLog[]): Transfer[] {
  return logs.flatMap(log => {
    if (log.topics[0] !== transferTopic || log.topics.length !== 3 || log.data.length !== 66) return [];
    const [from, to, amount] = erc20.decodeEventLog('Transfer', log.data, log.topics);
    return [{ token: log.address, from: from.toLowerCase(), to: to.toLowerCase(), amount }];
  });
}

export function sumTransfers(items: Transfer[], predicate: (transfer: Transfer) => boolean): bigint {
  return items.reduce((sum, item) => predicate(item) ? sum + item.amount : sum, 0n);
}

export function netPaid(items: Transfer[], token: string, payer: string): bigint {
  return sumTransfers(items, item => item.token === token && item.from === payer)
    - sumTransfers(items, item => item.token === token && item.to === payer);
}

export function timeRange(from: number, to: number, alias = ''): string {
  return `${alias}block_timestamp >= TO_TIMESTAMP_NTZ(${from}) AND ${alias}block_timestamp < TO_TIMESTAMP_NTZ(${to})`;
}

export function sqlList(values: string[]): string {
  return values.map(value => `'${value}'`).join(', ');
}

/** Require indexed data beyond the window before treating an empty result as zero activity. */
export async function indexedRows<T>(
  ctes: string, result: string, datasets: string[], end: number, description: string,
): Promise<T[]> {
  const checks = datasets.map(table => `EXISTS (
    SELECT 1 FROM ${table} WHERE ${timeRange(end, end + 900)}
  )`).join(' AND ');
  const rows: (T & { ready: boolean; tx_hash: string | null })[] = await queryAllium(`
    WITH ${ctes},
    indexed AS (SELECT ${checks} AS ready),
    data_rows AS (${result})
    SELECT indexed.ready, data_rows.* FROM indexed LEFT JOIN data_rows ON TRUE
  `);
  if (!rows[0]?.ready) throw new Error(`Wallet V ${description}: chain data has not reached ${new Date(end * 1000).toISOString()}`);
  return rows.filter(row => row.tx_hash !== null);
}

export type EvmCandidate = { tx_hash: string; timestamp: number };
export type TraceRow = EvmCandidate & {
  from_address?: string;
  to_address?: string;
  input?: string;
  value_raw?: string;
};

/** Fetch successful receipts and envelopes only for transactions selected by the chain index. */
export async function readEvmTransactions(chain: string, rows: TraceRow[]): Promise<EvmTradeTx[]> {
  const candidates = new Map<string, { timestamp: number; calls: Call[] }>();
  for (const row of rows) {
    const hash = row.tx_hash.toLowerCase();
    let candidate = candidates.get(hash);
    if (!candidate) {
      candidate = { timestamp: Number(row.timestamp), calls: [] };
      candidates.set(hash, candidate);
    }
    if (row.from_address && row.to_address) candidate.calls.push({
      from: row.from_address.toLowerCase(), to: row.to_address.toLowerCase(),
      input: row.input?.toLowerCase() ?? '0x', value: BigInt(row.value_raw ?? 0),
    });
  }

  const hashes = Array.from(candidates.keys());
  if (!hashes.length) return [];
  const transactions = await getTransactionsWithRetry(chain, hashes);
  const receipts = await getTxReceiptsWithRetry(chain, hashes);
  return hashes.map((hash, index) => {
    const transaction = transactions[index];
    const receipt = receipts[index];
    const candidate = candidates.get(hash)!;
    if (!transaction?.from || !receipt || Number(receipt.status) !== 1) {
      throw new Error(`Wallet V ${chain}: missing or unsuccessful receipt for indexed transaction ${hash}`);
    }
    return {
      hash, ...candidate,
      transaction: {
        from: transaction.from.toLowerCase(), to: transaction.to?.toLowerCase() ?? ZeroAddress,
        data: transaction.data?.toLowerCase() ?? '0x', value: BigInt(transaction.value),
      },
      logs: receipt.logs.map(log => ({ address: log.address.toLowerCase(), data: log.data, topics: log.topics })),
    };
  });
}
