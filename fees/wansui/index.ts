import { Adapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface FeeResponse {
    data: string;
}

const apiUrl = "https://api.prod.sui-pump.devucc.name/api/v1/fee";

export default {
    adapter: {
        [CHAIN.SUI]: {
            fetch: (async ({ fromTimestamp, toTimestamp }) => {
                const res: FeeResponse = await fetchURL(`${apiUrl}?from=${fromTimestamp}&to=${toTimestamp}`);

                return {
                    dailyFees: res.data,
                    dailyRevenue: res.data,
                    dailyProtocolRevenue: res.data,
                };
            }) as FetchV2,
            meta: {
                methodology: "Fee and revenue data is sum of total trade fee and graduated token fee.",
            }
        },
    },
    version: 2,
} as Adapter;
