import request from "graphql-request";
import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { addTokensReceived } from "../helpers/token";

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

const fetchFlow: any = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
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

const abi = {
	clawMachineCreated: "event ClawMachineCreated(address indexed clawMachine)",
	played: "event Played(address indexed user, uint256 indexed amount)",
	playToken: "function playToken() view returns (address)",
}

const clawMachineFactory = "0x8B50BAB7464764f6d102a9819B7db967256Db14c";
const bidRouter = "0x80d7C04B738eF379971a6b73f25B1A71ea1c820D";
const paymentToken = ADDRESSES.base.USDC;

const CLAW_MANAGERS = new Set(
	[
		"0x2129836a9ee21cD92129B05453F4Bdbd879566D7",
		"0x46e2Af76235d2fb959cf725f73443042a9aF7080",
		"0x279Dd5eE509783D04F002FDFc3d688a911557305",
		"0x61aA186Be094041F5C8C41c6AadF210532111fDc",
		"0xBa2b26Dd25C57838B7E500c539e0d85293d96FD4",
		"0xa69D72428AfFcCEcAc7C2fa91492480273E41200",
		"0x48C27EF6218Bc4f0714dd00df6941868B1afa54a",
		"0x69daaBeD9750a96F0eE7340b800930366D9dC976",
		"0x3BD1141C1dc3E74197411452DcAd9B1b2b6329F2",
	].map((a) => a.toLowerCase()),
);

const fetchBase = async (options: FetchOptions) => {
	const dailyVolume = options.createBalances();

	const clawMachineCreatedLogs = await options.getLogs({
		target: clawMachineFactory,
		eventAbi: abi.clawMachineCreated,
		fromBlock: 40451500,
		cacheInCloud: true,
	});

	const clawMachines = clawMachineCreatedLogs.map((log: any) => log.clawMachine);

	const playTokens = await options.api.multiCall({
		abi: abi.playToken,
		calls: clawMachines,
		permitFailure: true,
	});

	const machineToToken = new Map<string, string>();
	const validMachines: string[] = [];
	clawMachines.forEach((machine, i) => {
		if (playTokens[i]) {
			machineToToken.set(machine.toLowerCase(), playTokens[i]);
			validMachines.push(machine);
		}
	});

	const playedLogs = await options.getLogs({
		targets: validMachines,
		eventAbi: abi.played,
	});

	for (const log of playedLogs) {
		const machine = log.address?.toLowerCase() ?? "";
		const token = machineToToken.get(machine);
		if (!token) continue;

		dailyVolume.add(token, log.amount);
	}

	const swapVolume = options.createBalances();
	await addTokensReceived({
		options,
		target: bidRouter,
		balances: swapVolume,
		token: paymentToken,
		fromAdddesses: [...CLAW_MANAGERS],
	});

	const marketplaceVolume = options.createBalances();
	await addTokensReceived({
		options,
		target: bidRouter,
		balances: marketplaceVolume,
		token: paymentToken,
		logFilter: (log: any) => !CLAW_MANAGERS.has((log.from ?? "").toLowerCase()),
	});

	dailyVolume.add(swapVolume)
	dailyVolume.add(marketplaceVolume)

	return { dailyVolume, };
}

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		// [CHAIN.FLOW]: {
		// 	start: '2025-01-04',
		// 	fetch: fetchFlow,
		// },
		[CHAIN.BASE]: {
			start: '2026-01-06',
			fetch: fetchBase,
		},
	},
};

export default adapter;
