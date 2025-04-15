import request from "graphql-request";
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const graphUrl = "https://indexer.beezie.io/";

type FetchItemResult = {
	clawMachine: string;
	user: string;
	tokenId: string;
	currency: string;
	swapValue: string;
	price: string;
	timestamp: string;
};

const fetch: any = async ({ createBalances, startOfDay }: FetchOptions) => {
	const dailyVolume = createBalances();
	const dayMiliseconds = 24 * 60 * 60;
	const fromTimestamp = startOfDay - dayMiliseconds;

	let items: FetchItemResult[] = [];
	let hasNextPage = true;
	let endCursor = null;
	while (hasNextPage) {
		const query: string = `{
  clawMachineWins(
    where: {
      timestamp_gte: "${fromTimestamp}",
      timestamp_lt: "${startOfDay}"
    },
    orderBy: "timestamp",
    orderDirection: "desc",
    after: ${endCursor ? `"${endCursor}"` : null},
    limit: 1000
  ) {
    items {
      clawMachine,
      user,
      tokenId,
      currency,
      swapValue,
      price,
      timestamp
    },
    pageInfo {
      endCursor,
      hasNextPage
    },
    totalCount
  }
}`;
		const res = await request(graphUrl, query);
		if (res?.clawMachineWins?.items?.length > 0) {
			items = items.concat(res.clawMachineWins.items);
		}
		hasNextPage = res?.clawMachineWins?.pageInfo?.hasNextPage ?? false;
		endCursor = res?.clawMachineWins?.pageInfo?.endCursor ?? null;
	}
	for (const item of items) {
		dailyVolume.add(item.currency, item.swapValue);
	}
	return {
		timestamp: startOfDay,
		dailyVolume,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.FLOW]: {
			fetch,
		},
	},
};

export default adapter;
