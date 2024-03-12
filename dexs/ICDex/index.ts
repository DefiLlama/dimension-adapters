import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const fetch = async (timestamp: number): Promise<FetchResultVolume> => {
	let historicalVolume = (await fetchURL('https://gwhbq-7aaaa-aaaar-qabya-cai.raw.icp0.io/v1/latest'));
	let dailyVolume = 0;
	let totalVolume = 0;
	for (let key in historicalVolume) {
		dailyVolume = dailyVolume + Number(historicalVolume[key].usd_24h_volume);
		totalVolume = totalVolume + Number(historicalVolume[key].usd_volume);
	}
	return {
		dailyVolume: `${dailyVolume}`,
		// totalVolume: `${totalVolume}`,
		timestamp
	}
};


const adapter: Adapter = {
	adapter: {
		[CHAIN.ICP]: {
			fetch: fetch,
			start: 1705363200,
		},
	}
};

export default adapter;
