import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
const { request, } = require("graphql-request");
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { FetchOptions } from "../../adapters/types";

export const LINKS: { [key: string]: any } = {
	[CHAIN.SONIC]: {
		subgraph: sdk.graph.modifyEndpoint("CCzukThD1ovSzoGwYZg3ZQaXVqetRjec97aiLcjf48PK"),
	},
};
const methodology = {
	UserFees: "LPs collect 90% of the fee generated in a pool",
	Fees: "Fees generated on each swap at a rate set by the pool.",
};

export const fetch = async (_:any, _1: any, options: FetchOptions) => {
	const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.startOfDay) / 86400);
	const query = `{
    algebraDayData(id: ${dateId}) { feesUSD volumeUSD }
  }`;

	const data: any = await request(LINKS[options.chain].subgraph, query);

	return {
		dailyFees: data.algebraDayData?.feesUSD,
		dailyUserFees: data.algebraDayData?.feesUSD,
		dailyVolume: data.algebraDayData?.volumeUSD,
	};
};

export default {
	adapter: {
		[CHAIN.SONIC]: {
			fetch,
			start: "2024-12-07",
		},
	},
	methodology,
};
