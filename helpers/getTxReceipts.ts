import { getProvider, log } from "@defillama/sdk";
import { TransactionReceipt, Transaction } from "ethers";
import { PromisePool } from '@supercharge/promise-pool'
import { cacheTransactions, readCachedTransactions } from "./cache";

export async function getTxReceipts(chain: string, txHashes: string[], { cacheKey }: { cacheKey: string }): Promise<(TransactionReceipt | null)[]> {
  cacheKey = `tx-receipts/${chain}-${cacheKey}`
  txHashes = txHashes.map((tx) => tx.toLowerCase())
  const provider = getProvider(chain);
  const cache = await readCachedTransactions(cacheKey);
  const missingHashes = txHashes.filter((hash) => !cache[hash])

  if (missingHashes.length) log(`Fetching ${missingHashes.length}/${txHashes.length} tx receipts from ${chain}...`);

  const { results, errors } = await PromisePool
    .withConcurrency(20)
    .for(missingHashes)
    .process(async txHash => provider.getTransactionReceipt(txHash))

  results.forEach((tx: any) => {
    if (tx) cache[tx.transactionHash.toLowerCase()] = tx
  })
  await cacheTransactions(cacheKey, cache)

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  const res = txHashes.map((hash) => cache[hash] || null)
  return res
}

export default getTxReceipts;


export async function getTransactions(chain: string, txHashes: string[], { cacheKey }: { cacheKey: string }): Promise<(Transaction | null)[]> {
  cacheKey = `txns/${chain}-${cacheKey}`
  txHashes = txHashes.map((tx) => tx.toLowerCase())
  const provider = getProvider(chain);
  const cache = await readCachedTransactions(cacheKey);
  const missingHashes = txHashes.filter((hash) => !cache[hash])

  if (missingHashes.length) log(`Fetching ${missingHashes.length}/${txHashes.length} txs from ${chain}...`);


  const { results, errors } = await PromisePool
    .withConcurrency(20)
    .for(missingHashes)
    .process(async txHash => provider.getTransaction(txHash))

  results.forEach((tx: any) => {
    if (tx) cache[tx.hash.toLowerCase()] = tx
  })

  await cacheTransactions(cacheKey, cache)

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  const res = txHashes.map((hash) => cache[hash] || null)
  res.filter(tx => tx).forEach((tx: any) => tx.data = tx.input)
  return res
}