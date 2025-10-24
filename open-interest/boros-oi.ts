import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchUrl from "../utils/fetchURL";

const BOROS_API = "https://api.boros.finance/core/v1/markets";

async function fetch() {
    const borosTradeData = (await fetchUrl(BOROS_API)).results;
    const openInterestAtEnd = borosTradeData.reduce((acc: number, market: any) => {
        const markPrice = market.tokenId === 3 ? 1 : (market?.data?.assetMarkPrice ?? 0);
        acc += (markPrice * (market?.data?.notionalOI ?? 0));
        return acc;
    }, 0);

    return {
        openInterestAtEnd,
    }

}

const adapter: SimpleAdapter = {
    fetch,
    runAtCurrTime: true,
    chains: [CHAIN.ARBITRUM],
};

export default adapter;