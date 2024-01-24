import { getProvider, log } from "@defillama/sdk";
import { TransactionReceipt, Transaction } from "ethers";
import { PromisePool } from '@supercharge/promise-pool'

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


export async function getTransactions(chain: string, txHashes: string[]): Promise<(Transaction | null)[]> {
  const provider = getProvider(chain);
  log(`Fetching ${txHashes.length} txs from ${chain}...`);

  const { results, errors } = await PromisePool
    .withConcurrency(10)
    .for(txHashes)
    .process(async (txHash, i) => [await provider.getTransaction(txHash), i])

  if (errors.length) {
    log(`Errors: ${errors.length} while fetching ${chain} txs...`)
    throw errors
  }
  const flatResults = results.sort((a: any, b: any) => a[1] - b[1]).map((i => i[0])) as (Transaction | null)[]
  return flatResults;
}