import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const GUM_API_URL = "https://gum-api.jup.net/fe/mainnet-beta/perps/markets";

export async function fetch(_options: FetchOptions) {
    const response = await fetchURL(GUM_API_URL);

    // openInterest is USD notional and double-sided (long+short), so halve it
    const openInterestAtEnd = response.reduce((acc, curr) => acc + curr.openInterest, 0) / 2;

    return {
        openInterestAtEnd,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    chains: [CHAIN.JUPNET],
    fetch,
    runAtCurrTime: true,
};

export default adapter;