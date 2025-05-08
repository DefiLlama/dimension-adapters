import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
    const dayID = Math.floor(options.startOfDay / 86400);
    console.log("dayID :" + dayID)
    const query =gql`
    {
        algebraDayData(id:${dayID}) {
            id
            volumeUSD
        }
        factories {
            totalVolumeUSD
        }
    }`;
    const url = "https://api.studio.thegraph.com/query/50593/yaka-analytics/v0.0.3";
    const req = await request(url, query);
    return {
        dailyVolume: req.algebraDayData.volumeUSD,
        totalVolume: req.factories[0].totalVolumeUSD,
        timestamp: timestamp,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SEI]: {
            fetch,
            start: '2024-10-01',
        },
    }
}

export default adapter;
