import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {postURL} from "../../utils/fetchURL";
import {randomInt} from "node:crypto";
import {getTimestampAtStartOfDayUTC} from "../../utils/date";

const URL = 'https://api.tapp.exchange/api/v1'


interface TappDefillamaDimension {
    dailyVolume: number;
    dailyFee: number;
    dailyRevenue: number;
}

const getDefillamaDimension = async (start: number, end: number) => {
    const body = {
        "method": "public/defillama_dimension",
        "jsonrpc": "2.0",
        "id": randomInt(1, 1000),
        "params": {
            "startTime": start,
            "endTime": end,
        }
    }
    const dimension: { result: TappDefillamaDimension } = await postURL(URL, body)


    return dimension.result;
}


const fetch = async (timestamp: number) => {
    const startOfDay = getTimestampAtStartOfDayUTC(timestamp) * 1000;
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1000;

    const {dailyFee, dailyVolume, dailyRevenue} = await getDefillamaDimension(startOfDay, endOfDay);

    return {
        dailyFees: dailyFee,
        dailyRevenue: dailyRevenue,
        dailyVolume: dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch: fetch,
            start: "2025-06-12",
            meta: {
                methodology: {
                    Fees: "Total fees from swaps, based on the fee tier of each pool.",
                    Revenue: "Calculated as 33% of the total fees.",
                    Volume: "The total volume from all trades, calculated as the sum of input amounts for every swap transaction.",
                }
            }
        },
    },
};

export default adapter;