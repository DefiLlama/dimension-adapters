import { FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch: FetchV2 = async ({ toTimestamp, }): Promise<FetchResultV2> => {
    let volumeRes = await httpGet("https://app.xei.finance/indexer/1329/xei/dexVolume?endAt=" + toTimestamp.toString())
    return {
        dailyVolume: parseInt(volumeRes.data),

    };
};
const contract = {
    [CHAIN.SEI]: '0x0596a0469D5452F876523487251BDdE73D4B2597',

}
const adapter: SimpleAdapter = {
    adapter: Object.keys(contract).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: '2024-05-28',
            },
        }
    }, {}),
    version: 2,
};
export default adapter;