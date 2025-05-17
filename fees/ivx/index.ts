import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import fetchURL from "../../utils/fetchURL";

const IVX_API = "https://api.ivx.fi/v1"
const fetch = async (timestamp) => {

    let dailyFees = 0;
    const response = await fetchURL(`${IVX_API}/api/options/total-fees-chart?intervalType=1d&timestamp=${timestamp}`,);
    response.data.forEach(element => {
        dailyFees += element.totalFees;
    });


    return { dailyFees, dailyRevenue: dailyFees * 0.66 }
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.BERACHAIN]: {
            fetch,
        },
    },
};

export default adapter;