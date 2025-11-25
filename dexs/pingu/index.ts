import * as sdk from "@defillama/sdk";
import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
	volume: string;
	totalFees: string;
	id: string;
}

// G3dQNfEnDw4q3bn6QRSJUmcLzi7JKTDGYGWwPeYWYa6X
const MONAD_URL = 'https://api.studio.thegraph.com/query/75208/pingu-mon/0.0.2/';

const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const MONAD_ASSETS = [MONAD_USDC, ADDRESSES.null];

const CONFIGS: Record<string, any> = {
  [CHAIN.MONAD]: {
    graph: MONAD_URL,
    assets: MONAD_ASSETS,
  },
}

const fetch = async (timestamp: number, _: any, { chain, createBalances }: FetchOptions): Promise<FetchResult> => { 
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  
	const dailyVolume = createBalances()
	const dailyFees = createBalances()
	
	for (const asset of CONFIGS[chain].assets) {
		const query = gql`
     	{
				dayAssetData(id: "${dayTimestamp * 1000}-${asset.toLowerCase()}") {
					volume
					totalFees
				}
			}`;
		const response: IGraph = (await request(CONFIGS[chain].graph, query)).dayAssetData;
		const element = response;
		if (element && element.volume) {
			dailyVolume.add(asset, element.volume);
			dailyFees.add(asset, element.totalFees);
		}
	}
	return {
		dailyVolume,
		dailyFees,
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.MONAD]: {
			fetch: fetch,
			start: '2025-11-24',
		},
	},
};

export default adapter;
