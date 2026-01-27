import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import { FetchV2 } from "../../adapters/types";

type THeader = {
	[s: string]: string;
};
const headers: THeader = {
	origin: "https://polter.finance/",
	referer: "https://polter.finance/",
	"user-agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const RECORDS_PER_PAGE = 1000;
const endpoints: any = {
	[CHAIN.SONIC]:
		"https://api.studio.thegraph.com/query/71811/polter-sonic/version/latest",
	[CHAIN.FANTOM]:
		"https://api.studio.thegraph.com/query/71811/polter-ftm/v0.0.3",
	[CHAIN.BASE]:
		"https://api.studio.thegraph.com/query/71811/polter-base/version/latest",
};

const tokens: any = {
	sonic: {
		"0x44bd4f79a95cf04505f2dc5c8e2e4043f67c7b07": {
			gecko: "polter-finance",
			decimals: 18,
		},
		"0x81fae0ef10f391450f9b59e21c8115485b9f73cf": {
			gecko: "sonic-3",
			decimals: 18,
		},
		"0x07fe600220712d758f785f40474ecbeb81943cd6": {
			gecko: "ethereum",
			decimals: 18,
		},
		"0x3e43aa6281c8341b06f502c4f204d3242f67599f": {
			gecko: "sonic-bridged-usdc-e-sonic",
			decimals: 6,
		},
		"0x4227c901ca6af2afb772db7e93bb9ab25dd8adc5": {
			gecko: "tether",
			decimals: 6,
		},
	},
	fantom: {
		"0x5c725631fd299703d0a74c23f89a55c6b9a0c52f": {
			gecko: "polter-finance",
			decimals: 18,
		},
		"0xbbce4b1513d4285bd7a59c2c63835535151c8e7c": {
			gecko: "fantom",
			decimals: 18,
		},
		"0x5a75a5f3a637cc9394816efc553d102302d4cfcd": {
			gecko: "usd-coin",
			decimals: 6,
		},
		"0xa826b29d81caef8c9aa212f172ab3ef00566e91e": {
			gecko: "magic-internet-money",
			decimals: 18,
		},
		"0x4bf6f3210488091a0111daf7ab7cf840a3af8022": {
			gecko: "stader-sftmx",
			decimals: 18,
		},
		"0x0299553df0fa396c0f6f3456d293608e189c3cf3": {
			gecko: "solana",
			decimals: 9,
		},
		"0xb49da25f726451ba0e7c7e1c0b273322d2656514": {
			gecko: "layerzero-usdc",
			decimals: 6,
		},
		"0xc60f08059586849810d9c19c67919d2d99174ecf": {
			gecko: "axlusdc",
			decimals: 6,
		},
		"0xa37e0d5590436bd9abd2803c18c328a650b236ee": {
			gecko: "bitcoin",
			decimals: 8,
		},
		"0x328c7a684f160c089ebff07ff1b5a417f024979e": {
			gecko: "bridged-wrapped-ether-stargate",
			decimals: 18,
		},
	},
	base: {
		"0xa0820613976b441e2c6a90e4877e2fb5f7d72552": {
			gecko: "polter-finance",
			decimals: 18,
		},
		"0xca4e076c6d8a84a990986a3c405093087991a8fe": {
			gecko: "ethereum",
			decimals: 18,
		},
		"0x2a96e27e204ef366671232df28f147fa30e735ce": {
			gecko: "coinbase-wrapped-btc",
			decimals: 8,
		},
		"0x1ddaeebbd69dccc92f5cf76593104976b9c62434": {
			gecko: "usd-coin",
			decimals: 6,
		},
		"0x6f78d5d203ee7f4f3821ea7ae507e3e20b0930ef": {
			gecko: "aerodrome-finance",
			decimals: 18,
		},
	},
};

const nonTokens: string[] = [];

type RewardsPaid = {
	id: number;
	reward: BigInt;
	rewardsToken: string;
	blockTimestamp: number;
};

const fetch: FetchV2 = async ({
	chain,
	startTimestamp,
	endTimestamp,
	createBalances,
}) => {
	let skip = 0;
	const dailyFees = createBalances();
	const dailyRevenue = createBalances();
	const rewardsPaids: RewardsPaid[] = [];
	while (true) {
		const graphQuery = gql`{
        rewardPaids(
          first: ${RECORDS_PER_PAGE},
          skip: ${skip}
          where: { blockTimestamp_lte: ${endTimestamp}, blockTimestamp_gte: ${startTimestamp} },
          orderBy: blockTimestamp
          orderDirection: asc
        ) {
          id
          reward
          rewardsToken
          blockTimestamp
        }
    }`;

		const graphRes = await request(
			endpoints[chain],
			graphQuery,
			{},
			headers
		);
		const rewardsPaid = graphRes.rewardPaids;
		if (rewardsPaid.length == 0) {
			break;
		}
		skip += RECORDS_PER_PAGE;
		rewardsPaids.push(...rewardsPaid);
	}
	rewardsPaids.forEach((reward: RewardsPaid) => {
		if (nonTokens.includes(reward.rewardsToken.toLowerCase())) return;
		const { gecko, decimals } = tokens[chain][reward.rewardsToken];
		if (!gecko) {
			return;
		}
		dailyFees.addCGToken(gecko, Number(reward.reward) / 10 ** decimals);
		dailyRevenue.addCGToken(gecko, Number(reward.reward) / 10 ** decimals);
	});
	dailyRevenue.resizeBy(0.5);
	return {
		dailyFees,
		dailyRevenue,
	};
};

const adapter: Adapter = {
	version: 2,
	methodology: {
		Fees: "lockers' revenue = stakers' revenue + 50% penalty from early exit",
		Revenue: "depositors' revenue from borrow interests",
	},
	fetch,
	adapter: {
		[CHAIN.SONIC]: {
			start: "2025-03-23", // Mar-23-2025 04:19:01 AM +UTC
		},
		[CHAIN.FANTOM]: {
			start: "2024-01-29", // Jan-29-2024 04:49:13 PM +UTC
		},
		[CHAIN.BASE]: {
			start: "2024-09-14", // Sep-14-2024 02:51:51 AM +UTC
		},
	},
};

export default adapter;
