import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";

interface IGraph {
	totalFeesEth: string;
	totalFeesUsdc: string;
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
		  totalFeesEth
		  totalFeesUsdc
		  id
		}
	  }
    `

	const response: IGraph[] = (await request(URL, query)).dayDatas;
	const element = response.find(element => Number(element.id) / 1000 === dayTimestamp);

	const lastEthPrice = await fetchEthPrice(dayTimestamp);
	const dailytotalFeesEth = element ? Number(element.totalFeesEth) * lastEthPrice / 1e18 : 0;
	const dailytotalFeesUsdc = element ? Number(element.totalFeesUsdc) / 1e6 : 0;
	const dailyfees = dailytotalFeesUsdc + dailytotalFeesEth;

	let totalfees = 0;
	await Promise.all(response.map(async (element) => {
		const dayId = Number(element.id) / 1000;
		if (dayId <= dayTimestamp && dayId >= 1704844800) {
			const price = await fetchEthPrice(dayId);
			totalfees += Number(element.totalFeesUsdc) / 1e6;
			totalfees += Number(element.totalFeesEth) * price / 1e18;
		}
	}));

	return {
		dailyFees: dailyfees ? `${dailyfees}` : undefined,
		totalFees: totalfees ? `${totalfees}` : undefined,
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
