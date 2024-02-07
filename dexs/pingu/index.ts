import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";

interface IGraph {
	volumeEth: string;
	volumeUsdc: string;
	id: string;
}

async function fetchEthPrice(timestamp: number): Promise<number> {
	const ETH_PRICE_URL = `https://coins.llama.fi/prices/historical/${timestamp}/coingecko:ethereum`
	const ethRequest = await axios.get(ETH_PRICE_URL);
	return Number((ethRequest['data']['coins']['coingecko:ethereum']['price']))
}

const URL = 'https://api.studio.thegraph.com/query/43986/pingu-sg/0.1.0';

const fetch = async (timestamp: number): Promise<FetchResult> => {
	const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
	const query = gql`
    {
		dayDatas {
		  volumeEth
		  volumeUsdc
		  id
		}
	  }
    `

	const response: IGraph[] = (await request(URL, query)).dayDatas;
	const element = response.find(element => Number(element.id) / 1000 === dayTimestamp);

	const lastEthPrice = await fetchEthPrice(dayTimestamp);
	const dailyVolumeEth = element ? Number(element.volumeEth) * lastEthPrice / 1e18 : 0;
	const dailyVolumeUsdc = element ? Number(element.volumeUsdc) / 1e6 : 0;
	const dailyVolume = dailyVolumeUsdc + dailyVolumeEth;

	let totalVolume = 0;
	await Promise.all(response.map(async (element) => {
		const dayId = Number(element.id) / 1000;
		if (dayId <= dayTimestamp && dayId >= 1704844800) {
			const price = await fetchEthPrice(dayId);
			totalVolume += Number(element.volumeUsdc) / 1e6;
			totalVolume += Number(element.volumeEth) * price / 1e18;
		}
	}));

	return {
		dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
		totalVolume: totalVolume ? `${totalVolume}` : undefined,
		timestamp: dayTimestamp,
	};
}

const adapter: SimpleAdapter = {
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch: fetch,
			start: async () => 1704844800,
		},
	},
};

export default adapter;
