import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
    const dayID = Math.floor(options.startOfDay / 86400);
    const query =gql`
    {
        pancakeDayData(id:${dayID}) {
            id
            volumeUSD
        }
        factories {
            totalVolumeUSD
        }
    }`;
    const url = "https://gateway.graph.dgswap.io/dgswap-exchange-v3-kaia";
    const req = await request(url, query);
    return {
        dailyVolume: req.pancakeDayData.volumeUSD,
        totalVolume: req.factories[0].totalVolumeUSD,
        timestamp: timestamp,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SEI]: {
            fetch,
            start: '2024-05-28',
        },
    }
}

export default adapter;
