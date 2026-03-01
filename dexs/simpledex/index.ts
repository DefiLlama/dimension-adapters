import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SUMMARY_URL = "https://indexer.protonnz.com/api/defillama/summary";

const fetch = async (_options: FetchOptions) => {
    const data = await fetchURL(SUMMARY_URL);
    const { dailyVolume, dailyFees, dailyUserFees, dailyRevenue, dailySupplySideRevenue } = data;
    return {
        dailyVolume,
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.PROTON],
    runAtCurrTime: true,
};

export default adapter;
