import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
    const dayID = Math.floor(options.startOfDay / 86400);
    const query =gql`
    {
        uniswapDayData(id:${dayID}) {
            id
            volumeUSD
        }
    }`;
    const url = "https://api.goldsky.com/api/public/project_clu1fg6ajhsho01x7ajld3f5a/subgraphs/dragonswap-v3-prod/1.0.5/gn";
    const req = await request(url, query);
    return {
        dailyVolume: req.uniswapDayData.volumeUSD,
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
