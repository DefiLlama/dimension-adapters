import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { DanogoDimensions } from "./types";

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.tekoapis.com/api/v1/defillama-dimensions';
const DANOGO_START_TIMESTAMP = 1685404800 // 30/05/2023

const fetchDanogoGatewayData = async (timestamp: number): Promise<DanogoDimensions> => {
    const response = await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}?timestamp=${timestamp}`);

    return response.data;
}

const fetchData = async ({ endTimestamp, createBalances }: FetchOptions) => {
    const dailyFees = createBalances()
    const { dailyFeesAdaValue } = await fetchDanogoGatewayData(endTimestamp) as any
    dailyFees.addCGToken('cardano', dailyFeesAdaValue / 1e6)

    return { dailyFees, };
}

const adapter: SimpleAdapter = {
    adapter: {
        cardano: {
            fetch: fetchData,
            start: DANOGO_START_TIMESTAMP,
        }
    },
    version: 2,
    methodology: {
        Fees: 'Trading and listing fees paid by users.',
    }
};

export default adapter;
