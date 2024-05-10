import { httpPost } from "../../utils/fetchURL"
import { SimpleAdapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = 'https://ape.store/api/public/base/volume'

interface VolumeInfo {
	dailyVolume: string;
	totalVolume: string;
	timeStamp: number;
}

const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
	const volumeData: VolumeInfo = await httpPost(URL, { date: dayTimestamp }, {
		headers: {
			"Authorization": "8690be69-3c53-4bc1-8e99-e4fe0472b757"
		},
	});

	return {
		totalVolume: volumeData.totalVolume,
		dailyVolume: volumeData.dailyVolume,
		timestamp: volumeData.timeStamp,
	};
};

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.BASE]: {
			fetch: fetch,
			start: 1712265900,
		}
	},
};


export default adapter;