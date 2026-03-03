import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const CONCURRENCY = 25;

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.PULSECHAIN]: {
      fetch: async (options: FetchOptions) => {
        const dateStr = new Date((options.startTimestamp + 43200) * 1000).toISOString().slice(0, 10);

        // Total fees (base + tips) from explorer
        const fees = await httpGet(
          `https://api.scan.pulsechain.com/api?module=stats&action=totalfees&date=${dateStr}`
        );
        if (!fees?.result && fees?.result !== "0")
          throw new Error(`PulseChain: no fee data for ${dateStr} (status=${fees?.status}, message=${fees?.message})`);

        const dailyFees = options.createBalances();
        dailyFees.addGasToken(fees.result);

        // Base fees (burned) from block headers for revenue breakdown
        const fromBlock = await options.getFromBlock();
        const toBlock = await options.getToBlock();
        const provider = getProvider(CHAIN.PULSECHAIN);
        let totalBaseFees = BigInt(0);

        const blocks: number[] = [];
        for (let i = fromBlock; i < toBlock; i++) blocks.push(i);

        const { errors } = await PromisePool
          .withConcurrency(CONCURRENCY)
          .for(blocks)
          .process(async (blockNum) => {
            const block = await provider.getBlock(blockNum);
            if (!block || block.baseFeePerGas == null) return;
            totalBaseFees += BigInt(block.baseFeePerGas.toString()) * BigInt(block.gasUsed.toString());
          });
        if (errors.length > 0) throw errors[0];

        const dailyRevenue = options.createBalances();
        dailyRevenue.addGasToken(totalBaseFees);

        return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
      },
      start: "2023-05-13",
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
