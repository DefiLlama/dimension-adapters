import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

const PLS_BURNED_URL = "https://www.pulsechainstats.com/api/gas-stats/pls-burned";

type BurnDay = {
  date: string;
  estimatedDayBurn: number;
};

let cachedBurnDays: BurnDay[] | undefined;

async function getBurnDays(): Promise<BurnDay[]> {
  if (cachedBurnDays) return cachedBurnDays;

  const res = await fetchURL(PLS_BURNED_URL);
  const days = res?.data?.burn?.data;
  if (!res?.success || !Array.isArray(days)) {
    throw new Error("PulseChain: unexpected response from pulsechainstats PLS burned API");
  }

  cachedBurnDays = days;
  return days;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  if (options.dateString < "2026-09-04") {
    const days = await getBurnDays();
    const day = days.find((item) => item.date === options.dateString);
    if (!day) throw new Error(`PulseChain: no PLS burn data for ${options.dateString}`);
    dailyFees.addGasToken(day.estimatedDayBurn * 1e18, METRIC.TRANSACTION_BASE_FEES);
    return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
  }

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
  const dayStart = Date.parse(`${options.dateString}T00:00:00Z`) / 1000;
  const startBlock = await firstBlockAtOrAfter(fromBlock, dayStart);
  const endBlock = await firstBlockAtOrAfter(toBlock, dayStart + 86400) - 1;
  if (startBlock > endBlock) throw new Error(`PulseChain: no blocks for ${options.dateString}`);
  const dayBlocks = Array.from({ length: endBlock - startBlock + 1 }, (_, index) => startBlock + index);
  const { results, errors } = await PromisePool.withConcurrency(25).for(dayBlocks).process(async (blockNumber) => {
    const block = await getBlock(blockNumber);
    return BigInt(block.baseFeePerGas.toString()) * BigInt(block.gasUsed.toString());
  });
  if (errors.length) throw errors[0];

  dailyFees.addGasToken(results.reduce((sum, fee) => sum + fee, 0n), METRIC.TRANSACTION_BASE_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
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
