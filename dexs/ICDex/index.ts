import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const fetch = async (): Promise<FetchResultVolume> => {
	let historicalVolume = (await fetchURL('https://gwhbq-7aaaa-aaaar-qabya-cai.raw.icp0.io/v1/latest'));
	let dailyVolume = 0;
	for (let key in historicalVolume) {
		dailyVolume = dailyVolume + Number(historicalVolume[key].usd_24h_volume);
	}
	return {
		dailyVolume: dailyVolume,
	}
};


const adapter: Adapter = {
	adapter: {
		[CHAIN.ICP]: {
			fetch: fetch,
			runAtCurrTime: true,
			start: '2024-01-16',
		},
	}
};

export default adapter;
