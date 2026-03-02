import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const CONCURRENCY = 25;

function parseEthToWei(feeStr: string): bigint {
  const s = String(feeStr);
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Botanix: malformed fee value "${s}"`);
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole + frac.padEnd(18, "0").slice(0, 18));
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BOTANIX]: {
      fetch: async (options: FetchOptions) => {
        const dateStr = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);

        // Total fees (base + tips) from Routescan
        const res = await httpGet(
          `https://api.routescan.io/v2/network/mainnet/evm/3637/etherscan/api?module=stats&action=dailytxnfee&startdate=${dateStr}&enddate=${dateStr}`
        );
        if (!res?.result?.[0] || res.result[0].transactionFee_Eth === undefined)
          throw new Error(`Botanix: no fee data for ${dateStr} (status=${res?.status}, message=${res?.message})`);

        const dailyFees = options.createBalances();
        dailyFees.addGasToken(parseEthToWei(res.result[0].transactionFee_Eth));

        // Base fees (burned) from block headers for revenue breakdown
        const fromBlock = await options.getFromBlock();
        const toBlock = await options.getToBlock();
        const provider = getProvider(CHAIN.BOTANIX);
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
      start: "2025-07-01",
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
