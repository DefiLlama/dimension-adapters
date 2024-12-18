import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import * as sdk from "@defillama/sdk";

interface IGraph {
	totalFees: string;
	id: string;
}

const URL = 'https://api.studio.thegraph.com/query/75208/pingu-arb/0.0.2/';
const assets = [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.null];
const fetch = async (timestamp: number): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const chain = CHAIN.ARBITRUM;
	const balances = new sdk.Balances({ chain, timestamp });
	for (const asset of assets) {
		const query = gql`
    	{
				dayAssetData(id: "${dayTimestamp * 1000}-${asset.toLowerCase()}") {
					totalFees
				}
			}`;
		const response: IGraph = (await request(URL, query)).dayAssetData;
		const element = response;
		const realAsset = asset === ADDRESSES.null ? ADDRESSES.arbitrum.WETH : asset;
		balances._add(realAsset, element.totalFees);
	}
	return {
		dailyFees: await balances.getUSDString(),
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch: fetch,
			start: '2024-01-10',
		},
	},
};

export default adapter;
