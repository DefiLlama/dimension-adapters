import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types"
import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { uniV2Exports } from "../../helpers/uniswap";

const FACTORY_ADDRESS = '0x3e40739d8478c58f9b973266974c58998d4f9e8b';

const endpoints = {
	[CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AaAYom6ATrw15xZq3LJijLHsBj8xWdcL11Xg6sCxEBqZ'),
  };

const startDate = 1684702800;


const feeAdapter =  uniV2Exports({
  [CHAIN.CORE]: { factory: FACTORY_ADDRESS, },
}).adapter[CHAIN.CORE].fetch


const fetch = async (options: FetchOptions) => {
	const dataFactory = await request(endpoints[options.chain], gql
		`{
			dexSwapFactories {
				totalVolumeETH
			}
		}`
	)
	const totalVolume = dataFactory.dexSwapFactories[0].totalVolumeETH;
	let totalFees = new BigNumber(0);
	let date = startDate;
	let skip = 0;
	while (true) {
		const dataFees = await request(endpoints[options.chain], gql
			`query DexSwapFees {
				dexSwapFees(first: 1000,skip: ${skip}, orderBy: timestamp, where: { timestamp_gt: ${date}, timestamp_lte: ${options.endTimestamp} }) {
					volume,
					timestamp
				}
			}`
		)
		if (!dataFees.dexSwapFees.length) break;
		if (dataFees.dexSwapFees.length === 1000) {
			skip += 1000;
		}
		dataFees.dexSwapFees.forEach((data) => {
			totalFees = totalFees.plus(data.volume);
		})
		if (dataFees.dexSwapFees.length < 1000) break;
	}
	const dailyData = await feeAdapter(options as any, {}, options);
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
