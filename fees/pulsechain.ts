import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  if (fromBlock == null || toBlock == null || fromBlock > toBlock)
    throw new Error(`PulseChain: invalid block range for ${options.dateString}`);

  const provider = getProvider(CHAIN.PULSECHAIN);
  const getBlock = async (blockNumber: number) => {
    const block = await provider.getBlock(blockNumber);
    const baseFeePerGas = block?.baseFeePerGas;
    if (!block || baseFeePerGas == null) throw new Error(`PulseChain: missing base fee in block ${blockNumber}`);
    return { timestamp: block.timestamp, baseFeePerGas, gasUsed: block.gasUsed };
  };
  const firstBlockAtOrAfter = async (estimatedBlock: number, timestamp: number) => {
    let blockNumber = estimatedBlock;
    while (Number((await getBlock(blockNumber)).timestamp) < timestamp) blockNumber++;
    while (blockNumber > 0 && Number((await getBlock(blockNumber - 1)).timestamp) >= timestamp) blockNumber--;
    return blockNumber;
  };
  const startBlock = await firstBlockAtOrAfter(fromBlock, options.fromTimestamp);
  const endBlock = await firstBlockAtOrAfter(toBlock, options.toTimestamp) - 1;
  if (startBlock > endBlock) throw new Error(`PulseChain: no blocks for ${options.dateString}`);
  const periodBlocks = Array.from({ length: endBlock - startBlock + 1 }, (_, index) => startBlock + index);
  const { results, errors } = await PromisePool.withConcurrency(25).for(periodBlocks).process(async (blockNumber) => {
    const block = await getBlock(blockNumber);
    return BigInt(block.baseFeePerGas.toString()) * BigInt(block.gasUsed.toString());
  });
  if (errors.length) throw errors[0];

  dailyFees.addGasToken(results.reduce((sum, fee) => sum + fee, 0n), METRIC.TRANSACTION_BASE_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.PULSECHAIN],
  start: '2023-05-13',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Estimated PLS burned from EIP-1559 base fees.',
    Revenue: 'PLS burned via EIP-1559 base fee.',
    HoldersRevenue: 'PLS burned via EIP-1559 base fee.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Estimated PLS base fees burned.',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Estimated PLS base fees burned.',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Estimated PLS base fees burned.',
    },
  },
}

export default adapter;
