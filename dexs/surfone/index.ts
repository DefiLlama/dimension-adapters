import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const volumeEndpoint = "https://apigateway.surf.one/pool/24h/data"

const headers = {
    "Block-Chain-Id":  '8453',
};

interface IVolume {
    totalVolume: number,
    totalTradeSize: number,
}

const fetch = () => {
    return async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
        const response = (await httpGet(volumeEndpoint, { headers }));

        const volume: IVolume = response.data;
        return {
            totalVolume: `${volume?.totalVolume || undefined}`,
            dailyVolume: `${volume?.totalTradeSize || undefined}`,
            timestamp: dayTimestamp,
        };
    };
}


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch: fetch(),
            runAtCurrTime: true,
            start: 7963804,
        }
    },
};

export default adapter;
