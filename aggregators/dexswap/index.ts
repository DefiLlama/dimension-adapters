import { FetchOptions } from "../../adapters/types"
import { exportDexVolumeAndFees } from "../../helpers/dexVolumeLogs";
import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";

const FACTORY_ADDRESS = '0x3e40739d8478c58f9b973266974c58998d4f9e8b';

const apiKey = '';
const graphUrl = `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/AaAYom6ATrw15xZq3LJijLHsBj8xWdcL11Xg6sCxEBqZ`;

const startDate = 1684702800;

const fetch = async (options: FetchOptions) => {
	const dataFactory = await request(graphUrl, gql
		`{
			dexSwapFactories {
				totalVolumeETH
			}
		}`
	)
	const totalVolume = dataFactory.dexSwapFactories[0].totalVolumeETH;
	let totalFees = new BigNumber(0);
	let date = startDate;
	while (true) {
		const dataFees = await request(graphUrl, gql
			`query DexSwapFees {
				dexSwapFees(first: 900, orderBy: timestamp, where: { timestamp_gt: ${date} }) {
					volume,
					timestamp
				}
			}`
		)
		if (!dataFees.dexSwapFees.length) break;
		dataFees.dexSwapFees.forEach((data) => {
			totalFees = totalFees.plus(data.volume);
		})
		const last = dataFees.dexSwapFees[dataFees.dexSwapFees.length - 1].timestamp;
		if (last === date) break;
		date = last;
	}
	const dailyData = await exportDexVolumeAndFees({ chain: CHAIN.ARBITRUM, factory: FACTORY_ADDRESS })(options.endTimestamp, {}, options);
	return {
		...dailyData,
		totalVolume,
		totalFees: totalFees.div(10 ** 18).toString(),
	}
} 

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch,
			start: startDate,
		},
	}
};

export default adapter;
