import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

const HYPERLIQUID_API = "https://api-ui.hyperliquid.xyz/info";
const tradeXYZData = {
    type: "metaAndAssetCtxs",
    dex: "xyz"
};

async function fetch(_a: any, _b: any, _c: any): Promise<FetchResult> {
    const response = await postURL(HYPERLIQUID_API, tradeXYZData);

    const data = response[1].reduce((acc: { volume: number, openInterest: number }, { dayNtlVlm, markPx, openInterest }: { dayNtlVlm: string, markPx: string, openInterest: string }) => {
        acc.volume += +dayNtlVlm;
        acc.openInterest += +markPx * +openInterest;
        return acc;
    }, { volume: 0, openInterest: 0 });

    return {
        dailyVolume: data.volume,
        openInterestAtEnd: data.openInterest
    }
}

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: '2025-10-13'
};

export default adapter;