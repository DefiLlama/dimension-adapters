import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
    Fees: 'Protocol fees on the rewards.',
    ProtocolRevenue: 'A Part of protocol fees are charged as revenue.',
};

const readAmount = (value: unknown): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const fetch = async ({ startTimestamp, endTimestamp, dateString }: FetchOptions) => {
    const fees = (await fetchURL(`https://haedal.xyz/api/v1/wal/vault/fees?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`)).data;

    const dailyFees = readAmount(fees?.fee);
    const dailyRevenue = readAmount(fees?.revenue);

    if (dailyFees === null || dailyRevenue === null)
        throw new Error(
            `haedal-vault: unreadable vault fee response for ${dateString} (fee ${JSON.stringify(fees?.fee)}, revenue ${JSON.stringify(fees?.revenue)})`
        );

    if (dailyRevenue > dailyFees)
        throw new Error(
            `haedal-vault: api returned ${dailyRevenue} revenue against ${dailyFees} fees for ${dateString}, revenue is a share of the fees and cannot exceed them`
        );

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SUI],
    start: '2025-03-20',
    methodology,
};

export default adapter;