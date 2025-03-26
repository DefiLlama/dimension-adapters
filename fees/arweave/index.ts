import type { FetchOptions, } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const axios = require('axios');


const fetch = async (options: FetchOptions) => {
    const dayTimestamp = options.startOfDay * 1000;

    const { data } = await axios.get('https://api.viewblock.io/arweave/stats/advanced/charts/txFees?network=mainnet', {
        headers: {
            'origin': 'https://arscan.io'
        }
    });

    const timestamps = data.day.data[0];
    const fees = data.day.data[1];

    const index = timestamps.findIndex((ts: number) => ts === dayTimestamp);
    const tokenAmount = index !== -1 ? parseFloat(fees[index]) : 0;

    const dailyFees = options.createBalances();
    dailyFees.addCGToken('arweave', tokenAmount)

    return {
        dailyFees,
    }
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.ARWEAVE]: {
            fetch,
            start: '2018-06-08'
        },
    }
}

export default adapter;

