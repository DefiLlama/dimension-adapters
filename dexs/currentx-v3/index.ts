import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
    const dayID = Math.floor(options.startOfDay / 86400);
    const query =gql`
    {
        uniswapDayData(id:${dayID}) {
            id
            dailyVolumeUSD
        }
    }`;
    const url = "https://api.goldsky.com/api/public/project_cmlbj5xkhtfha01z0caladt37/subgraphs/currentx-v2/1.0.0/gn";
    const req = await request(url, query);
    if (!req.uniswapDayData) {
        return { dailyVolume: "0" };
    }
     return {
         dailyVolume: req.uniswapDayData.dailyVolumeUSD,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.MEGAETH]: {
            fetch,
            start: '2026-02-06',
        },
    }
}

export default adapter;
