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