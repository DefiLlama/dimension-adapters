import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

const HOTSTUFF_API_URL = "https://api.hotstuff.trade/info";

async function fetch(options: FetchOptions) {
    const openInterestAtEnd = options.createBalances();

    const marketsInfo = await postURL(HOTSTUFF_API_URL, {
        method: "ticker",
        params: {
            symbol: "all",
        },
    })

    for (const market of marketsInfo) {
        openInterestAtEnd.addUSDValue(Number(market.open_interest) * Number(market.mark_price) * 2);
    }

    return {
        openInterestAtEnd
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.HOTSTUFF],
    runAtCurrTime: true,
}

export default adapter;