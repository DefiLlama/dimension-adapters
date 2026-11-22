import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchDanogoGatewayData } from "../../dexs/danogo";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const { dailyFeesAdaValue } = await fetchDanogoGatewayData(options);
    dailyFees.addCGToken('cardano', Number(dailyFeesAdaValue) / 1e6)

    return { dailyFees, dailyRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
    version: 1, // API returns whole days
    fetch,
    chains: [CHAIN.CARDANO],
    start: '2023-05-30',
    methodology: {
        Fees: 'Trading and listing fees paid by users.',
        Revenue: 'All the fees are revenue'
    }
};

export default adapter;
