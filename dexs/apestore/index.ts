import { httpPost } from "../../utils/fetchURL"
import { FetchOptions, FetchResultV2, Adapter } from "../../adapters/types";

const URL = 'https://ape.store/api/public/base/volume'

interface VolumeInfo {
	dailyVolume: string;
	totalVolume: string;
	timeStamp: number;
}

const adapter: Adapter = {
	version: 2,
	adapter: {
		base: {
			fetch: async (options: FetchOptions): Promise<FetchResultV2> => {
				const volumeData: VolumeInfo = await httpPost(URL, { date: options.startOfDay }, {
					headers: {
						"Authorization": "92ff54fa-80b7-4f2c-bae1-f862ea7525ae"
					},
				});

				return {
					totalVolume: volumeData.totalVolume,
					dailyVolume: volumeData.dailyVolume,
					timestamp: volumeData.timeStamp,
				};
			},
			start: 1712265900,
		}
	},
};


export default adapter;