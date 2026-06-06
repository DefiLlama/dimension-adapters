import { request, gql } from "graphql-request";

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const subgraphEndpoint = 'https://api.core-1.dexter.zone/v1/graphql';
const query = gql`{
    daily: pool_daily_aggregate {
        total_swap_fee
    }
    total: swap_volume_lifetime_aggregate {
        total_fee_generated
    }
}`;

interface IGraphResult {
    daily: Array<{ total_swap_fee: number }>
    total: [{ total_fee_generated: number }]
}

async function fetch(options: FetchOptions) {
    const res: IGraphResult = await request(subgraphEndpoint, query);
    const dailyFees = res.daily.reduce((acc, d) => acc + d.total_swap_fee, 0);

    return {
        dailyFees,
    };
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.PERSISTENCE],
    runAtCurrTime: true,
};

export default adapter;
