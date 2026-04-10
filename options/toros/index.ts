import { SimpleAdapter } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../../utils/date";

const DHEDGE_GRAPHQL_ENDPOINT = "https://api-v2.dhedge.org/graphql";

interface IOptionsVolumeResponse {
    dailyNotionalVolume: string;
    dailyPremiumVolume: string;
}

async function fetch(timestamp: number) {
    const dayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
    const query = `
    query {
        getOptionsVolume(timestamp: ${dayTimestamp}) {
            dailyNotionalVolume
            dailyPremiumVolume
        }
    }
    `;
    const response: { data: { getOptionsVolume: IOptionsVolumeResponse } } = await httpPost(DHEDGE_GRAPHQL_ENDPOINT, { query });

    const { dailyNotionalVolume, dailyPremiumVolume } = response.data.getOptionsVolume;

    return {
        dailyNotionalVolume,
        dailyPremiumVolume,
    };
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.ARBITRUM],
    fetch,
    start: '2025-06-15'
};

export default adapter;
