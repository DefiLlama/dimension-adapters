import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
	totalFees: string;
	id: string;
}

const ARBITRUM_URL = 'https://api.studio.thegraph.com/query/75208/pingu-arb-2/0.0.1/';
const ARBITRUM_ASSETS = [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.null];
const fetch_arbitrum = async (timestamp: number, _: any, { createBalances }: FetchOptions): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const dailyFees = createBalances()
	for (const asset of ARBITRUM_ASSETS) {
		const query = gql`
    	{
				dayAssetData(id: "${dayTimestamp * 1000}-${asset.toLowerCase()}") {
					totalFees
				}
			}`;
		const response: IGraph = (await request(ARBITRUM_URL, query)).dayAssetData;
		const element = response;
		if (element && element.totalFees) {
			dailyFees.add(asset, element.totalFees);
		}
	}
	return {
		dailyFees,
		timestamp: dayTimestamp,
	};
}

const MONAD_URL = 'https://api.studio.thegraph.com/query/75208/pingu-mon/0.0.2/';
const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const MONAD_ASSETS = [MONAD_USDC, ADDRESSES.null];
const fetch_monad = async (timestamp: number, _: any, { createBalances }: FetchOptions): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const dailyFees = createBalances()
	for (const asset of MONAD_ASSETS) {
		const query = gql`
			{
				dayAssetData(id: "${dayTimestamp * 1000}-${asset.toLowerCase()}") {
					totalFees
				}
			}`;
		const response: IGraph = (await request(MONAD_URL, query)).dayAssetData;
		const element = response;
		if (element && element.totalFees) {
			dailyFees.add(asset, element.totalFees);
		}
	}
	return {
		dailyFees,
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	version: 1,
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch: fetch_arbitrum,
			start: '2024-01-10',
		},
		[CHAIN.MONAD]: {
			fetch: fetch_monad,
			start: '2025-11-24',
		},
	},
};

export default adapter;
