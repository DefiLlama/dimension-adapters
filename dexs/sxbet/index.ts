import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const SXBET_API = "https://api.prod.sx.bet/analytics"

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const volumeData = (await fetchURL(`${SXBET_API}/volume?interval=day&aggregate=false&startDate=${options.startOfDay}&endDate=${options.endTimestamp}`)).data;
    const dailyVolume = volumeData[0].usdVolume;
    const openInterestAtEnd = (await fetchURL(`${SXBET_API}/openInterest`)).data;

    return {
        dailyVolume,
        openInterestAtEnd,
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SXR],
    start: '2019-03-04'
};

export default adapter;