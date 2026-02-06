import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const key = process.env.THEGRAPH_API_KEY;

const fetch = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
    const dayID = Math.floor(options.startOfDay / 86400);
    const query =gql`
    {
        uniswapDayData(id:${dayID}) {
            id
            volumeUSD
        }
    }`;
    const url = "https://gateway.thegraph.com/api/subgraphs/id/Hw24iWxGzMM5HvZqENyBQpA6hwdUTQzCSK5e5BfCXyHd";
    const req = await request(url, query);
    return {
        dailyVolume: req.uniswapDayData.volumeUSD,
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
