import { FetchOptions } from "../adapters/types";
import { getProvider } from "@defillama/sdk";
import { METRIC } from "./metrics";
import { PromisePool } from '@supercharge/promise-pool';
import { ethers } from "ethers";

const MAX_CONCURRENT_REQUESTS = 5;

export async function getFeesFromRPC(options: FetchOptions) {
  const { chain, createBalances } = options;
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const provider = getProvider(chain);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  let dailyGasUsed = 0;
  let dailyTxns = 0;

  const blocks = [];
  for (let i = fromBlock; i <= toBlock; i++) {
    blocks.push(i);
  }

  await PromisePool
    .withConcurrency(MAX_CONCURRENT_REQUESTS)
    .for(blocks)
    .process(async (blockNumber) => {
      try {
        const blockHex = '0x' + blockNumber.toString(16);
        let fees = BigInt(0);
        let revenue = BigInt(0);
        let gasUsedBlock = BigInt(0);

        let txnCount = 0;

        // Try eth_getBlockReceipts
        try {
            const receipts = await (provider as any).send("eth_getBlockReceipts", [blockHex]);
            if (receipts && receipts.length > 0) {
                txnCount = receipts.length;
                for (const r of receipts) {
                    const gasUsed = BigInt(r.gasUsed);
                    const effectiveGasPrice = BigInt(r.effectiveGasPrice || 0);
                    const fee = gasUsed * effectiveGasPrice;
                    fees += fee;
                    gasUsedBlock += gasUsed;
                }
                
                const block = await provider.getBlock(blockNumber, false);
                if (block && block.baseFeePerGas) {
                    revenue += gasUsedBlock * BigInt(block.baseFeePerGas);
                }
                
                dailyFees.addGasToken(fees, METRIC.TRANSACTION_GAS_FEES);
                dailyRevenue.addGasToken(revenue, METRIC.TRANSACTION_BASE_FEES);
                dailyGasUsed += Number(gasUsedBlock);
                dailyTxns += txnCount;
                return;
            }
        } catch (e) {
            // Fallback
        }

        // Fallback: getBlock with transactions
        const block = await provider.getBlock(blockNumber, true);
        if (!block) return;
        
        gasUsedBlock = BigInt(block.gasUsed);
        const txs = block.prefetchedTransactions || block.transactions;

        if (txs) {
            txnCount = txs.length;
            if (txnCount > 0) {
                let totalGasPrice = BigInt(0);
                let count = 0;
                
                for (const tx of txs) {
                    if (typeof tx === 'string') continue;
                    const gasPrice = tx.gasPrice || tx.maxFeePerGas;
                    if (gasPrice) {
                        totalGasPrice += BigInt(gasPrice);
                        count++;
                    }
                }
                
                if (count > 0) {
                    const avgGasPrice = totalGasPrice / BigInt(count);
                    fees = gasUsedBlock * avgGasPrice;
                }
            }
        }
        
        if (block.baseFeePerGas) {
            revenue = gasUsedBlock * BigInt(block.baseFeePerGas);
        }

        dailyFees.addGasToken(fees, METRIC.TRANSACTION_GAS_FEES);
        dailyRevenue.addGasToken(revenue, METRIC.TRANSACTION_BASE_FEES);
        dailyGasUsed += Number(gasUsedBlock);
        dailyTxns += txnCount;

      } catch (e) {
        // console.error(`Failed to fetch block ${blockNumber} on ${chain}`, e);
      }
    });

  return {
    dailyFees,
    dailyRevenue,
    dailyGasUsed,
    dailyTxns,
  };
}
