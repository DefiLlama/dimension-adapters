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
    const url = "https://gateway.thegraph.com/api/subgraphs/id/3berhRZGzFfAhEB5HZGHEsMAfQ2AQpDk2WyVr5Nnkjyv";
    const req = await request(url, query);
    return {
        dailyVolume: req.uniswapDayData.dailyVolumeUSD,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.MEGAETH]: {
            fetch,
            start: '2026-02-03',
        },
    }
}

export default adapter;