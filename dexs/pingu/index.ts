import * as sdk from "@defillama/sdk";
import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
	volume: string;
	id: string;
}

const URL = sdk.graph.modifyEndpoint('9btrLusatbsmZPPkhH8aKc3xypbD7i4xsprS22SFwNxF');
const assets = [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.null];

const fetch = async (timestamp: number, _: any, { createBalances }: FetchOptions): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const dailyVolume = createBalances()
	for (const asset of assets) {
		const query = gql`
    		{
				dayAssetData(id: "${dayTimestamp * 1000}-${asset.toLowerCase()}") {
					volume
				}
			}`;
		const response: IGraph = (await request(URL, query)).dayAssetData;
		if (response){
			const element = response;
			dailyVolume.add(asset, element.volume);	
		}
	}
	return {
		dailyVolume,
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch: fetch,
			start: '2024-01-10',
		},
	},
};

export default adapter;
