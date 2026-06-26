import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
    const res = await fetchURL(
        `https://api-backend-mainnet.up.railway.app/defillama/derivatives?start=${startTimestamp}&end=${endTimestamp}`
    );

    return {
        openInterestAtEnd: res.openInterestAtEndUsd,
        longOpenInterestAtEnd: res.longOpenInterestAtEndUsd,
        shortOpenInterestAtEnd: res.shortOpenInterestAtEndUsd,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: "2026-04-15",
};

export default adapter;
