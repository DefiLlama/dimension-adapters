import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import * as sdk from "@defillama/sdk";

const URL = sdk.graph.modifyEndpoint('C9xUT6c9uRH4f4yT6aMvhZizk89GpgcUBjraJFdmHrYQ');
const fetch = async (_:any, _1:any, { startOfDay, createBalances}: FetchOptions): Promise<FetchResult> => {
	const dailyVolume = createBalances();
	const dailyFees = createBalances();
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(startOfDay * 1000));
	const query = `
    {
			dayData(id: ${dayTimestamp * 1000}) {
				volumeEth
				volumeUsdc
				totalFeesEth
				totalFeesUsdc
			}
		}`;
	const dayData: any = (await request(URL, query)).dayData;
	if (dayData) {
		dailyVolume.add(ADDRESSES.arbitrum.USDC_CIRCLE, dayData.volumeUsdc);
		dailyFees.add(ADDRESSES.arbitrum.USDC_CIRCLE, dayData.totalFeesUsdc);
		dailyVolume.add(ADDRESSES.arbitrum.WETH, dayData.volumeEth);
		dailyFees.add(ADDRESSES.arbitrum.WETH, dayData.totalFeesEth);
	}

	return {
		dailyVolume, dailyFees,
	};
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch: fetch,
			start: '2024-04-03',
		},
	},
};

export default adapter;
