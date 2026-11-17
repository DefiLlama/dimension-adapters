import { ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { createUrlRpcSenders, fetchEvmChainMetrics } from "../helpers/evmChainFees";

const config = {
  chain: CHAIN.EDU_CHAIN,
  rpcSenders: createUrlRpcSenders(["https://rpc.educhain.xyz"]),
};

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
    const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
    if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock)) throw new Error("EDU Chain fee window is missing a block boundary");
    const totalFeesWei = fromBlock <= toBlock
      ? (await fetchEvmChainMetrics({ ...config, fromBlock, toBlock })).totalFeesWei
      : 0n;
    const dailyFees = options.createBalances();
    dailyFees.addCGToken("edu-coin", Number(totalFeesWei) / 1e18);
    return { dailyFees };
  },
};

export default adapter;
