import request, { gql } from "graphql-request";
import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions): Promise<any> => {
    const dayID = Math.floor(options.startOfDay / 86400);
    const query =gql`
    {
        pancakeDayData(id:${dayID}) {
            id
            dailyVolumeUSD
        }
        pancakeFactories {
            totalVolumeUSD
        }
    }`;
    const url = sdk.graph.modifyEndpoint('3J7Ry3oVQhhCmfEMpCwqa1aMtEmt66dU9fUuR31DTvx1');
    const req = await request(url, query);
    return {
        dailyVolume: req.pancakeDayData.dailyVolumeUSD,
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SEI],
    start: '2024-07-01',
}

export default adapter;
