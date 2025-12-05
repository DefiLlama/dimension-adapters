import {CHAIN} from "../../helpers/chains";
import {FetchOptions, SimpleAdapter} from "../../adapters/types";
import axios from "axios";

const info: { [key: string]: any } = {
    [CHAIN.MONAD]: {
        api: "https://mainnet-api.monday.trade/v4/public/thirdPart/defillama/volumeAndFees",
        chainId: 143,
    },
};

const fetch = async (_t: number, _: any, options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const chainInfo = info[CHAIN.MONAD]
    const resData = await axios.get(chainInfo.api, {
        params: {
            chainId: chainInfo.chainId,
            startTime: options.startTimestamp,
            endTime: options.endTimestamp,
        }
    })
    const data = resData.data
    data.data.forEach((item: any) => {
        dailyVolume.addToken(item.tokenAddress, item.volume);
    })
    return {
        dailyVolume,
    };
};
const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.MONAD]: {
            fetch,
            start: '2025-11-25',
        },
    },
};

export default adapter;
