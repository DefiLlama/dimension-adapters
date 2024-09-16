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
        uniswapFactories {
            totalVolumeUSD
        }
    }`;
    const url = "https://api.goldsky.com/api/public/project_clu1fg6ajhsho01x7ajld3f5a/subgraphs/dragonswap-prod/1.0.0/gn";
    const req = await request(url, query);
    return {
        dailyVolume: req.uniswapDayData.dailyVolumeUSD,
        totalVolume: req.uniswapFactories[0].totalVolumeUSD,
        timestamp: timestamp,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SEI]: {
            fetch,
            start: 1716854400,
        },
    }
}

export default adapter;
