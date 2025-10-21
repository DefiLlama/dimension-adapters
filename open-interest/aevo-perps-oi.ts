import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";

async function fetch() {
    const { summaries } = await fetchUrl("https://api.aevo.xyz/markets-summary");

    const openInterestAtEnd = summaries.filter((assetInfo: any) => assetInfo.perpetual_info).reduce((acc: number, market: any) => acc + +market?.perpetual_info?.open_interest?.total * +market?.index_price, 0)

    return {
        openInterestAtEnd
    }
}

const adapter: SimpleAdapter = {
    chains: [CHAIN.ETHEREUM],
    fetch,
    runAtCurrTime: true
}

export default adapter;