import {CHAIN} from "../../helpers/chains";
import {FetchOptions, SimpleAdapter} from "../../adapters/types";
import {httpGet} from "../../utils/fetchURL";

const volumeApi = "https://mainnet-api.monday.trade/v4/public/thirdPart/defillama/volumeAndFees"
const oiApi = "https://mainnet-api.monday.trade/v4/public/thirdPart/openInterest"

const chainConfig: { [key: string]: any } = {
    [CHAIN.MONAD]: {chainId: 143, start: '2025-11-25'}
};

const fetch = async (_t: number, _: any, options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const chainInfo = chainConfig[options.chain]

    const volumeData = await httpGet(volumeApi, {
        params: {
            chainId: chainInfo.chainId,
            startTime: options.startTimestamp,
            endTime: options.endTimestamp,
        }
    })

    const oiData = await httpGet(oiApi, {
        params: {
            chainId: chainInfo.chainId,
        }
    })

    const oi = Number(oiData.data);

    volumeData.data.forEach((item: any) => {
        dailyVolume.addToken(item.tokenAddress, Number(item.volume));
        dailyFees.addToken(item.tokenAddress, Number(item.fee));
    })

    return {dailyVolume, dailyFees, openInterestAtEnd: oi};
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    adapter: chainConfig,
    methodology: {
        Volume: 'Volume is calculated by summing the notional value (qty * entryPrice) of all OpenMarketTrade events.',
        OpenInterest: 'Open Interest is calculated by summing the long and short open interest of all pairs.',
        Fees: "fees paid by takers on the protocol by using market orders, these fees paid goes to limit order makers, AMM LP and protocol fees",
    },
};

export default adapter;
