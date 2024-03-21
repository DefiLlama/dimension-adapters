import fetchURL from "../../utils/fetchURL"
import customBackfill from "../../helpers/customBackfill";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";

const mapChainId = 22776
const historicalVolumeEndpoint = (page: number) => `https://api-dass.izumi.finance/api/v1/izi_swap/summary_record/?chain_id=${mapChainId}&type=4&page_size=60&order_by=-time&&page=${page}`

interface IVolumeall {
    volDay: number;
    chainId: number;
    timestamp: number;
}

type TAdapter = {
    [key:string]: any;
};

const fetch = () => {
    return async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
        let isSuccess = true;
        let page = 1;
        const historical: IVolumeall[] = [];
        while (isSuccess) {
            const response = (await fetchURL(historicalVolumeEndpoint(page)));
            if (response.is_success){
                Array.prototype.push.apply(historical, response.data);
                page += 1;
            } else {
                isSuccess = false;
            };
        };
        const historicalVolume = historical.filter(e => e.chainId === mapChainId);
        const totalVolume = historicalVolume
            .filter(volItem => (new Date(volItem.timestamp).getTime()) <= dayTimestamp)
            .reduce((acc, { volDay }) => acc + Number(volDay), 0)

        const dailyVolume = historicalVolume
            .find(dayItem => (new Date(dayItem.timestamp).getTime()) === dayTimestamp)?.volDay

        return {
            totalVolume: `${totalVolume}`,
            dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
            timestamp: dayTimestamp,
        };
    }
};

const adapter = {
    adapter: {
        [mapChainId]: {
            fetch: fetch(),
            start: 1710086400,
            customBackfill: customBackfill(mapChainId?.toString(), fetch)
        }
    }
};

export default adapter;
