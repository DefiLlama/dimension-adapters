import { getProvider } from "@defillama/sdk";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

const IMX_CG_TOKEN = 'immutable-x';
const EXPLORER_API = 'https://explorer.immutable.com/api';
const FEE_HISTORY_BLOCKS = 1024;
const GAS_LIMIT = 30_000_000;

const BASE_FEES_BURNED = 'Transaction Base Fees Burned';
const PRIORITY_FEES_TO_VALIDATOR = 'Transaction Priority Fees To Validator';

const blockscoutFetch = (blockscoutFeeAdapter2(CHAIN.IMX).adapter as any)[CHAIN.IMX].fetch;
const toHex = (n: number) => '0x' + n.toString(16);

const rpcSend = async (method: string, params: any[]) => {
  const provider: any = getProvider(CHAIN.IMX);
  const senders = provider.rpcs?.map((rpc: any) => rpc.provider) ?? [provider];
  let lastError: any;
  for (const sender of senders) {
    try {
      return await sender.send(method, params);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
};

const getBlockHeader = async (block: number) => {
  const header = await rpcSend('eth_getBlockByNumber', [toHex(block), false]);
  if (!header) throw new Error(`Immutable zkEVM: missing block ${block}`);
  return { timestamp: Number(header.timestamp), gasLimit: Number(header.gasLimit) };
};

const firstBlockAtOrAfter = async (options: FetchOptions, timestamp: number) => {
  let block = await options.getBlock(timestamp, options.chain, {});
  if (!block) {
    // the block-by-time lookup fails for the launch days because the genesis block has timestamp 0
    const { result } = await httpGet(`${EXPLORER_API}?module=block&action=getblocknobytime&timestamp=${timestamp}&closest=after`);
    block = Number(result?.blockNumber);
    if (!block) throw new Error(`Immutable zkEVM: no block found for timestamp ${timestamp}`);
  }
  while ((await getBlockHeader(block)).timestamp < timestamp) block++;
  while (block > 0 && (await getBlockHeader(block - 1)).timestamp >= timestamp) block--;
  return block;
};

// sum of baseFeePerGas * gasUsed over blocks [fromBlock, toBlock)
const getBurnedBaseFees = async (fromBlock: number, toBlock: number) => {
  let burned = 0n;
  let newest = toBlock - 1;
  while (newest >= fromBlock) {
    const count = Math.min(FEE_HISTORY_BLOCKS, newest - fromBlock + 1);
    const { oldestBlock, baseFeePerGas, gasUsedRatio } = await rpcSend('eth_feeHistory', [toHex(count), toHex(newest), []]);
    const oldest = Number(oldestBlock);
    if (!gasUsedRatio?.length || oldest < fromBlock || oldest + gasUsedRatio.length - 1 !== newest)
      throw new Error(`Immutable zkEVM: unexpected eth_feeHistory range ${oldestBlock}+${gasUsedRatio?.length} for blocks ending ${newest}`);
    gasUsedRatio.forEach((ratio: number, i: number) => {
      burned += BigInt(baseFeePerGas[i]) * BigInt(Math.round(ratio * GAS_LIMIT));
    });
    newest = oldest - 1;
  }
  return burned;
};

const fetch = async (options: FetchOptions) => {
  const [{ dailyFees: gasFees }, fromBlock, toBlock] = await Promise.all([
    blockscoutFetch(options),
    firstBlockAtOrAfter(options, options.startTimestamp),
    firstBlockAtOrAfter(options, options.endTimestamp),
  ]);

  const { gasLimit } = await getBlockHeader(toBlock - 1);
  if (gasLimit !== GAS_LIMIT) throw new Error(`Immutable zkEVM: block gas limit changed to ${gasLimit}, update GAS_LIMIT`);
  const burnedIMX = Number(await getBurnedBaseFees(fromBlock, toBlock)) / 1e18;

  const baseFees = options.createBalances();
  baseFees.addCGToken(IMX_CG_TOKEN, burnedIMX);
  const priorityFees = gasFees.clone();
  priorityFees.subtract(baseFees);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(baseFees, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addBalances(priorityFees, METRIC.TRANSACTION_PRIORITY_FEES);

  const dailyRevenue = baseFees.clone(1, BASE_FEES_BURNED);
  const dailyHoldersRevenue = baseFees.clone(1, BASE_FEES_BURNED);
  const dailySupplySideRevenue = priorityFees.clone(1, PRIORITY_FEES_TO_VALIDATOR);

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.IMX],
  start: '2023-12-11',
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Gas fees paid in IMX by users for transactions on Immutable zkEVM, made up of the EIP-1559 base fee and the priority fee.',
    Revenue: 'IMX burned through the EIP-1559 base fee.',
    HoldersRevenue: 'IMX burned through the EIP-1559 base fee.',
    SupplySideRevenue: 'Priority fees paid to the block validator, currently a single Immutable-run signer.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'EIP-1559 base fees paid in IMX, summed per block as base fee times gas used.',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Priority fees (tips) paid in IMX on top of the base fee.',
    },
    Revenue: {
      [BASE_FEES_BURNED]: 'EIP-1559 base fees, which are burned.',
    },
    HoldersRevenue: {
      [BASE_FEES_BURNED]: 'EIP-1559 base fees, which are burned.',
    },
    SupplySideRevenue: {
      [PRIORITY_FEES_TO_VALIDATOR]: 'Priority fees paid to the block validator, currently a single Immutable-run signer.',
    },
  },
};

export default adapter;
