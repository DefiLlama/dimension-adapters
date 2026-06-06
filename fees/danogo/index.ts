import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const DANOGO_GATEWAY_ENDPOINT = 'https://danogo-gateway.tekoapis.com/api/v1/defillama-dimensions';
// const DANOGO_START_TIMESTAMP = 1685404800 // 30/05/2023

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const { dailyFeesAdaValue } = (await fetchURL(`${DANOGO_GATEWAY_ENDPOINT}?timestamp=${options.toTimestamp}`)).data;
    dailyFees.addCGToken('cardano', dailyFeesAdaValue / 1e6)

    return { dailyFees, dailyRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.CARDANO],
    start: '2023-05-30',
    methodology: {
        Fees: 'Trading and listing fees paid by users.',
        Revenue: 'All the fees are revenue'
    }
};

export default adapter;
