import { PromisePool } from '@supercharge/promise-pool';
import { FetchOptions } from '../../../adapters/types';
import { CHAIN } from '../../chains';
import { getTransaction } from '../../solana';
import { startTimestamp, swapChains } from './config';
import { Amount, indexedRows, timeRange } from './evm-data';
import { Swap } from './evm-swaps';

// Wallet V's Jupiter fee authority. Swap reference:
// 371nFQmdZ7oFvttwQLu8ratU4tcL5bTMzFx5Ma17gCVaA185RfXKBT7Sx5JFe7XaJBN992ZYVRFFDqVbrvBX5F7w
const feeOwner = '8EQkAYq6vEP9VVeiGQtZhKZtkBySRmoQGDZeEU8hJDcy';
const jupiter = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const splTokenPrograms = new Set([
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]);
// These two fee accounts provide a fallback for index rows expressed in
// token-account form. The balance owner in the original transaction is authoritative.
const usdcFeeAccount = 'CWgqT4tjzetsTK8pjCru6xiop3Jw5mkSLyC1si2PSet1';
const solFeeAccount = 'DRp8cr7N6aRe9hjbffF5KVq1yok4Cqudu99E4tH2Gxvy';

type Account = { mint: string; owner?: string };
type Instruction = {
  programId: string;
  parsed?: {
    type: string;
    info: {
      account?: string; mint?: string; owner?: string; wallet?: string;
      source?: string; destination?: string; authority?: string;
      amount?: string; tokenAmount?: { amount: string };
    };
  };
};

type TokenBalance = Account & { accountIndex: number };

export type ParsedSwapTransaction = {
  blockTime: number | null;
  transaction: {
    message: {
      accountKeys: { pubkey: string; signer: boolean }[];
      instructions: Instruction[];
    };
  };
  meta: {
    err: unknown;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: { index: number; instructions: Instruction[] }[];
  } | null;
};

type SplMovement = Amount & { source: string; destination: string; authority?: string };

function tokenAccounts(transaction: ParsedSwapTransaction): Map<string, Account> {
  const { accountKeys, instructions } = transaction.transaction.message;
  const accounts = new Map<string, Account>();
  for (const balance of [...(transaction.meta?.preTokenBalances ?? []), ...(transaction.meta?.postTokenBalances ?? [])]) {
    const address = accountKeys[balance.accountIndex]?.pubkey;
    if (address) accounts.set(address, { mint: balance.mint, owner: balance.owner ?? accounts.get(address)?.owner });
  }
  const all = [...instructions, ...(transaction.meta?.innerInstructions ?? []).flatMap(group => group.instructions)];
  for (const item of all) {
    const parsed = item.parsed;
    if (!parsed) continue;
    const { account, mint, owner, wallet } = parsed.info;
    if (!account || !mint) continue;
    if (splTokenPrograms.has(item.programId) && parsed.type.startsWith('initializeAccount')) {
      accounts.set(account, { mint, owner });
    } else if (item.programId === 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' && wallet) {
      accounts.set(account, { mint, owner: wallet });
    }
  }
  return accounts;
}

function movement(item: Instruction, accounts: Map<string, Account>): SplMovement | undefined {
  const parsed = item.parsed;
  if (!parsed || !splTokenPrograms.has(item.programId)
    || !['transfer', 'transferChecked'].includes(parsed.type)) return;
  const { source, destination, authority, mint, amount, tokenAmount } = parsed.info;
  if (!source || !destination) return;
  const token = mint ?? accounts.get(source)?.mint ?? accounts.get(destination)?.mint;
  const rawAmount = tokenAmount?.amount ?? amount;
  if (token && rawAmount && BigInt(rawAmount) > 0n) {
    return { source, destination, authority, token, amount: BigInt(rawAmount) };
  }
}

/** Count only transfers inside the Jupiter instruction that paid the affiliate. */
export function decodeJupiterSwaps(tx: ParsedSwapTransaction): Swap[] {
  if (!tx.meta || tx.meta.err) return [];
  const { accountKeys, instructions } = tx.transaction.message;
  const signers = new Set(accountKeys.filter(key => key.signer).map(key => key.pubkey));
  if (signers.has(feeOwner)) return [];
  const accounts = tokenAccounts(tx);
  const result: Swap[] = [];

  for (const group of tx.meta.innerInstructions ?? []) {
    if (instructions[group.index]?.programId !== jupiter) continue;
    const movements = group.instructions.flatMap(item => {
      const transfer = movement(item, accounts);
      return transfer ? [transfer] : [];
    });
    const fees = movements.filter(item => accounts.get(item.destination)?.owner === feeOwner);
    if (!fees.length || movements.some(item => accounts.get(item.source)?.owner === feeOwner)) continue;

    // A swap can pay its fee from either side. Start at the first debit from a
    // signer-owned source account to the route (or the fee account), and count
    // additional debits and refunds on that same source account exactly once.
    const source = movements.find(item => {
      const owner = accounts.get(item.source)?.owner;
      return owner && signers.has(owner) && (owner === item.authority || item.authority === undefined)
        && accounts.get(item.destination)?.owner !== owner;
    });
    const amount = source ? movements.reduce((sum, item) => {
      if (item.token !== source.token) return sum;
      if (item.source === source.source) return sum + item.amount;
      if (item.destination === source.source) return sum - item.amount;
      return sum;
    }, 0n) : 0n;
    result.push({
      volume: source && amount > 0n ? { token: source.token, amount } : undefined,
      fees: fees.map(({ token, amount }) => ({ token, amount })),
    });
  }
  return result;
}

/** Use indexed SPL transfers to find candidates, then read the original instructions. */
export async function readSolanaSwaps(options: FetchOptions): Promise<Swap[]> {
  const from = Math.max(options.startTimestamp, startTimestamp(swapChains[CHAIN.SOLANA].start));
  const end = options.endTimestamp;
  if (from >= end) return [];
  const rows = await indexedRows<{ tx_hash: string }>(`
    fee_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.assets.transfers
      WHERE ${timeRange(from, end)}
        AND to_address IN ('${feeOwner}', '${usdcFeeAccount}', '${solFeeAccount}')
        AND raw_amount > 0
    )`, `
    SELECT DISTINCT i.txn_id AS tx_hash
    FROM solana.raw.instructions i
    JOIN fee_txs f ON f.txn_id = i.txn_id
    WHERE ${timeRange(from, end, 'i.')} AND i.program_id = '${jupiter}'
  `, ['solana.assets.transfers', 'solana.raw.instructions'], end, 'Jupiter');

  const { results, errors } = await PromisePool.withConcurrency(4).for(rows).process(async ({ tx_hash }) => {
    const tx = await getTransaction({
      signature: tx_hash, commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0,
    }) as ParsedSwapTransaction | null;
    if (!tx || !tx.meta || tx.blockTime === null) throw new Error(`Missing Solana receipt for ${tx_hash}`);
    if (tx.blockTime < from || tx.blockTime >= end) {
      throw new Error(`Wallet V Jupiter: indexed signature ${tx_hash} is outside the requested window`);
    }
    return decodeJupiterSwaps(tx);
  });
  if (errors.length) throw new Error(`Wallet V Jupiter: ${errors.length} Solana receipt error(s): ${errors[0].message}`);
  return results.flat();
}
