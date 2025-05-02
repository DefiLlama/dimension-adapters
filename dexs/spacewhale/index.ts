import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import * as sdk from "@defillama/sdk";
import { modifyEndpoint } from '@defillama/sdk/build/util/graph';

interface IGraph {
	volumeEth: string;
	volumeUsdc: string;
	id: string;
}

const URL = modifyEndpoint('C9xUT6c9uRH4f4yT6aMvhZizk89GpgcUBjraJFdmHrYQ');
const fetch = async (timestamp: number): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const chain = CHAIN.ARBITRUM;
	const balances = new sdk.Balances({ chain, timestamp })
	const query = gql`
    {
			dayData(id: ${dayTimestamp * 1000}) {
				volumeEth
				volumeUsdc
			}
		}`;
	const dayData: IGraph = (await request(URL, query)).dayData;
	if (dayData) {
		balances._add(ADDRESSES.arbitrum.USDC_CIRCLE, dayData.volumeUsdc);
		balances._add(ADDRESSES.arbitrum.WETH, dayData.volumeEth);
	}

	return {
		dailyVolume: await balances.getUSDString(),
		timestamp: dayTimestamp,
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
