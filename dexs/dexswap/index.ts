import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types"
import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { uniV2Exports } from "../../helpers/uniswap";

const FACTORY_ADDRESS = '0x3e40739d8478c58f9b973266974c58998d4f9e8b';

const endpoints = {
	[CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('AaAYom6ATrw15xZq3LJijLHsBj8xWdcL11Xg6sCxEBqZ'),
  };

const startDate = 1684702800;


const feeAdapter =  uniV2Exports({
  [CHAIN.ARBITRUM]: { factory: FACTORY_ADDRESS, },
}).adapter![CHAIN.ARBITRUM].fetch


const fetch = async (options: FetchOptions) => {
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
		if (dataFees.dexSwapFees.length < 1000) break;
	}
	const dailyData = await feeAdapter(options as any, {}, options);
	return {
		...dailyData,
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
