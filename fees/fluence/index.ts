import fetchURL from '../../utils/fetchURL'
import { FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains';

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const results = (await fetchURL("https://network-dashboards-api.stage.fluence.dev/api/v1/network-revenue")).accumulatedSnapshots;

    //Has delay in api
    const today = new Date((options.startOfDay - 86400) * 1000).toISOString().slice(0, 19) + 'Z';
    const yesterday = new Date(((options.startOfDay - 172800) * 1000)).toISOString().slice(0, 19) + 'Z';

    const feeAccumulationTillToday = (results.find((snapshot: { date: string, value: number }) => snapshot.date === today))?.value ?? 0;
    const feeAccumulationTillYesterday = (results.find((snapshot: { date: string, value: number }) => snapshot.date === yesterday))?.value ?? 0;

    const dailyFees = Math.abs(feeAccumulationTillToday - feeAccumulationTillYesterday);

    return {
        dailyFees,
        dailyRevenue: 0
    }

}

const methodology = {
    Fees: "Fees paid by GPU service users",
    Revenue: "No chain revenue"
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.FLUENCE],
    protocolType: ProtocolType.CHAIN,
    methodology,
    start: '2024-03-24'
};

export default adapter;