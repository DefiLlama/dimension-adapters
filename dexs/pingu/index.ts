import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
	volume: string;
	id: string;
}

const URL = 'https://api.studio.thegraph.com/query/75208/pingu-arb/0.0.2/';
const assets = [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.null];
const fetch = async (timestamp: number, _: any, { createBalances }: FetchOptions): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const dailyVolume = createBalances();
	for (const asset of assets) {
		const query = gql`
    	{
				dayAssetData(id: "${dayTimestamp * 1000}-${asset.toLowerCase()}") {
					volume
				}
			}`;
		const { volume }: IGraph = (await request(URL, query)).dayAssetData;
		dailyVolume.add(asset, volume);
	}
	return {
		dailyVolume,
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch,
			start: '2024-01-10',
		},
	},
};

export default adapter;
