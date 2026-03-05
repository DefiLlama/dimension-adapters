import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const CONCURRENCY = 25;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dateStr = options.dateString;
    const feesData = await fetchURL(`https://api.scan.pulsechain.com/api?module=stats&action=totalfees&date=${dateStr}`);

    const dailyFees = options.createBalances();
    dailyFees.addGasToken(feesData.result);

    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();
    const provider = getProvider(CHAIN.PULSECHAIN);
    let totalBaseFees = BigInt(0);

    const blocks: number[] = [];
    for (let i = fromBlock; i <= toBlock; i++) blocks.push(i);

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

}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.PULSECHAIN],
    start: '2023-05-13',
    protocolType: ProtocolType.CHAIN,
}

export default adapter;
