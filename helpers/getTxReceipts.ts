import { getProvider, log } from "@defillama/sdk";
import { TransactionReceipt, Transaction } from "ethers";
import { PromisePool } from '@supercharge/promise-pool'

export async function getTxReceipts(chain: string, txHashes: string[]): Promise<(TransactionReceipt | null)[]> {
  txHashes = txHashes.map((tx) => tx.toLowerCase())
  const provider = getProvider(chain);
  const cache: any = {}

  const { results, errors } = await PromisePool
    .withConcurrency(20)
    .for(txHashes)
    .process(async txHash => provider.getTransactionReceipt(txHash))

  results.forEach((tx: any) => {
    if (tx) cache[tx.transactionHash.toLowerCase()] = tx
  })

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  const res = txHashes.map((hash) => cache[hash] || null)
  return res
}

export default getTxReceipts;


export async function getTransactions(chain: string, txHashes: string[]): Promise<(Transaction | null)[]> {
  txHashes = txHashes.map((tx) => tx.toLowerCase())
  const provider = getProvider(chain);
  const cache: any = {}



  const { results, errors } = await PromisePool
    .withConcurrency(20)
    .for(txHashes)
    .process(async txHash => provider.getTransaction(txHash))

  results.forEach((tx: any) => {
    if (tx) cache[tx.hash.toLowerCase()] = tx
  })

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  const res = txHashes.map((hash) => cache[hash] || null)
  res.filter(tx => tx).forEach((tx: any) => tx.data = tx.input)
  return res
}

// A provider a block or two behind answers getTransactionReceipt/getTransaction with null
// rather than an error, so callers that read null as "nothing happened" silently drop real
// data. Measured on a fixed set of five transactions: 0 to 2 nulls per run, varying between
// runs. These wrappers re-request only the stragglers and leave the result in hash order.
const RETRY_ATTEMPTS = 3;

async function retryByHash<T>(
  hashes: string[],
  fetchBatch: (batch: string[]) => Promise<(T | null)[]>,
): Promise<(T | null)[]> {
  const byHash = new Map<string, T>();
  let pending = hashes;

  for (let attempt = 0; attempt < RETRY_ATTEMPTS && pending.length; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));

    const fetched = await fetchBatch(pending);
    pending.forEach((hash, index) => {
      const value = fetched[index];
      if (value) byHash.set(hash, value);
    });
    pending = pending.filter((hash) => !byHash.has(hash));
  }

  if (pending.length) log(`${pending.length} of ${hashes.length} hashes unresolved after ${RETRY_ATTEMPTS} attempts`);
  return hashes.map((hash) => byHash.get(hash) ?? null);
}

export function getTxReceiptsWithRetry(chain: string, txHashes: string[]) {
  return retryByHash(txHashes.map((hash) => hash.toLowerCase()), (batch) => getTxReceipts(chain, batch));
}

export function getTransactionsWithRetry(chain: string, txHashes: string[]) {
  return retryByHash(txHashes.map((hash) => hash.toLowerCase()), (batch) => getTransactions(chain, batch));
}
