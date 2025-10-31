import { request, gql } from "graphql-request";

import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

async function fetch(timestamp: number) {
    const res: IGraphResult = await request(subgraphEndpoint, query);
    const dailyFees = res.daily.reduce((acc, d) => acc + d.total_swap_fee, 0);
    return {
        timestamp: getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)),
        dailyFees,
    };
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.PERSISTENCE]: {
            fetch,
            runAtCurrTime: true,
                    },
    },
    version: 1
};

export default adapter;
