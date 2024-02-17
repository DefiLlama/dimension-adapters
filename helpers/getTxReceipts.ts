import { getProvider, log } from "@defillama/sdk";
import { TransactionReceipt, Transaction } from "ethers";
import { PromisePool } from '@supercharge/promise-pool'
import { cacheTransactions, readCachedTransactions } from "./cache";

export async function getTxReceipts(chain: string, txHashes: string[]): Promise<(TransactionReceipt | null)[]> {
  const provider = getProvider(chain);
  log(`Fetching ${txHashes.length} txs from ${chain}...`);

  const { results, errors } = await PromisePool
    .withConcurrency(10)
    .for(txHashes)
    .process(async (txHash, i) => [await provider.getTransactionReceipt(txHash), i])

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  const flatResults = results.sort((a: any, b: any) => a[1] - b[1]).map((i => i[0])) as (TransactionReceipt | null)[]
  return flatResults;
}

export default getTxReceipts;


export async function getTransactions(chain: string, txHashes: string[], { cacheKey }: { cacheKey: string}): Promise<(Transaction | null)[]> {
  txHashes = txHashes.map((tx) => tx.toLowerCase())
  const provider = getProvider(chain);
  const cache = await readCachedTransactions(cacheKey);
  const missingHashes = txHashes.filter((hash) => !cache[hash])

  if (missingHashes.length) log(`Fetching ${missingHashes.length}/${txHashes.length} txs from ${chain}...`);


  const { results, errors } = await PromisePool
    .withConcurrency(20)
    .for(missingHashes)
    .process(async txHash=> provider.getTransaction(txHash))

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  results.forEach((tx: any) => {
    if (tx) cache[tx.hash.toLowerCase()] = tx
  })
  await cacheTransactions(cacheKey, cache)
  const res = txHashes.map((hash) => cache[hash] || null)
  res.filter(tx => tx).forEach((tx: any) => tx.data = tx.input)
  return res
}