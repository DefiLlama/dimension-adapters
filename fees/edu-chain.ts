import { ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createUrlRpcSenders, fetchEvmChainMetrics } from "../helpers/evmChainFees";

const [rpcSender] = createUrlRpcSenders(["https://rpc.educhain.xyz"]);

const config = {
  chain: CHAIN.EDU_CHAIN,
  // The public RPC rate limits batched receipt requests.
  blockChunkSize: 1,
  batchConcurrency: 1,
  blockConcurrency: 1,
  rpcSenders: [rpcSender],
};

// The SDK can return a nearby block when the exact timestamp falls in a gap.
async function lastBlockAtOrBefore(guess: number, timestamp: number): Promise<number> {
  const getTimestamp = async (height: number): Promise<number | undefined> => {
    const block = await rpcSender.send("eth_getBlockByNumber", [`0x${height.toString(16)}`, false]);
    if (!block) return undefined;
    const blockTimestamp = Number(block.timestamp);
    if (!Number.isInteger(blockTimestamp)) throw new Error(`Invalid EDU Chain timestamp at block ${height}`);
    return blockTimestamp;
  };

  let height = guess;
  let blockTimestamp = await getTimestamp(height);
  if (blockTimestamp === undefined) throw new Error(`Missing EDU Chain block ${height}`);
  if (blockTimestamp > timestamp) {
    while (height > 0) {
      blockTimestamp = await getTimestamp(--height);
      if (blockTimestamp === undefined) throw new Error(`Missing EDU Chain block ${height}`);
      if (blockTimestamp <= timestamp) return height;
    }
    return -1;
  }

  const head = Number(await rpcSender.send("eth_blockNumber", []));
  while (height < head) {
    const nextTimestamp = await getTimestamp(height + 1);
    if (nextTimestamp === undefined) throw new Error(`Missing EDU Chain block ${height + 1}`);
    if (nextTimestamp > timestamp) break;
    height++;
  }
  return height;
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  chains: [config.chain],
  start: "2026-08-03",
  methodology: {
    Fees: "Transaction gas fees paid in EDU, calculated from gas used and effective gas price in on-chain receipts.",
  },
  fetch: async (options) => {
    const [fromGuess, toGuess] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
    if (!Number.isInteger(fromGuess) || !Number.isInteger(toGuess)) throw new Error("EDU Chain fee window is missing a block boundary");
    const fromBlock = 1 + await lastBlockAtOrBefore(Math.max(0, fromGuess - 1), options.fromTimestamp - 1);
    const toBlock = await lastBlockAtOrBefore(toGuess, options.toTimestamp);
    const totalFeesWei = fromBlock <= toBlock
      ? (await fetchEvmChainMetrics({ ...config, fromBlock, toBlock })).totalFeesWei
      : 0n;
    const dailyFees = options.createBalances();
    dailyFees.addCGToken("edu-coin", Number(totalFeesWei) / 1e18);
    return { dailyFees };
  },
};

export default adapter;
