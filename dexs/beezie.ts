import request from "graphql-request";
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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

const getQuery = (fromTimestamp: number, toTimestamp: number, endCursor: any) => `{
  clawMachineWins(
    where: {
      timestamp_gte: "${fromTimestamp}",
      timestamp_lt: "${toTimestamp}"
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
}`

const fetch: any = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
	const dailyVolume = createBalances();

	let hasNextPage = true;
	let endCursor = null;
	while (hasNextPage) {
		const query: string = getQuery(fromTimestamp, toTimestamp, endCursor);
		const res = await request(graphUrl, query);
		if (res?.clawMachineWins?.items?.length > 0) {
			res.clawMachineWins.items.forEach((item: FetchItemResult) => dailyVolume.add(item.currency, item.swapValue));
		}
		hasNextPage = res?.clawMachineWins?.pageInfo?.hasNextPage ?? false;
		endCursor = res?.clawMachineWins?.pageInfo?.endCursor ?? null;
	}
	return { dailyVolume, };
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.FLOW]: {
			start: '2025-01-04',
			fetch,
		},
	},
};

export default adapter;
