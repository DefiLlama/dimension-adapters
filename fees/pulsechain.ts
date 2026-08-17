import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const CONCURRENCY = 25;

const TOTAL_FEES_URL = (dateStr: string) =>
    `https://api.scan.pulsechain.com/api?module=stats&action=totalfees&date=${dateStr}`;

// The blockscout indexer behind this endpoint can stall while still answering
// 200 with message "OK". It returned "0" on 2026-08-08 and null every day from
// 2026-08-09, on a chain that was producing 15-40 transactions a block the
// whole time. Unchecked, the first shape published a real zero-fee day and the
// second reached addGasToken(null) and died without saying why.
const readTotalFees = (raw: unknown, dateStr: string): bigint => {
    if (raw === null || raw === undefined || raw === "") {
        throw new Error(`pulsechain: explorer returned no totalfees for ${dateStr} (${TOTAL_FEES_URL(dateStr)})`);
    }
    let value: bigint;
    try {
        value = BigInt(String(raw));
    } catch {
        throw new Error(`pulsechain: explorer returned a non-numeric totalfees ${JSON.stringify(raw)} for ${dateStr}`);
    }
    if (value < 0n) {
        throw new Error(`pulsechain: explorer returned a negative totalfees ${value} for ${dateStr}`);
    }
    return value;
};

const sumBaseFees = async (options: FetchOptions): Promise<bigint> => {
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

    return totalBaseFees;
};

const fetch = async (options: FetchOptions) => {
    const dateStr = options.dateString;

    const [feesData, totalBaseFees] = await Promise.all([
        fetchURL(TOTAL_FEES_URL(dateStr)),
        sumBaseFees(options),
    ]);

    const totalFees = readTotalFees(feesData?.result, dateStr);

    // Base fees are burnt out of the fees users paid, so they are a subset of
    // the total. A zero total against a positive burn is arithmetically
    // impossible and means the explorer is behind, not that the chain was idle.
    // Both being zero is a genuinely idle window and is left alone.
    if (totalFees === 0n && totalBaseFees > 0n) {
        throw new Error(`pulsechain: explorer reports 0 totalfees for ${dateStr} while the blocks in that window burnt ${totalBaseFees} base fees`);
    }

    const dailyFees = options.createBalances();
    dailyFees.addGasToken(totalFees);

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
