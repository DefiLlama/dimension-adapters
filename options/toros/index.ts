import { SimpleAdapter } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

const DHEDGE_GRAPHQL_ENDPOINT = "https://api-v2.dhedge.org/graphql";

interface IOptionsVolumeResponse {
    dailyNotionalVolume: string;
    dailyPremiumVolume: string;
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: false,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchTorosVolumeData,
            start: '2025-06-15'
        },
    },
};

export async function fetchTorosVolumeData(
    /** Timestamp representing the end of the 24 hour period */
    timestamp: number
) {
    const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
    const volumeData = await getOptionsVolume(dayTimestamp);

    return {
        timestamp,
        dailyNotionalVolume: volumeData.dailyNotionalVolume,
        dailyPremiumVolume: volumeData.dailyPremiumVolume,
    };
}

async function getOptionsVolume(timestamp: number): Promise<IOptionsVolumeResponse> {
    const query = `
        query {
            getOptionsVolume(timestamp: ${timestamp}) {
                dailyNotionalVolume
                dailyPremiumVolume
            }
        }
    `;
    const response = await httpPost(DHEDGE_GRAPHQL_ENDPOINT, { query });
    return response.data.getOptionsVolume;
}

export default adapter;