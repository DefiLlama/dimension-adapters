import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";

interface IData {
	chain: string;
	token: string;
	amount: number;
}

const chainsMap: Record<string, string> = {
	"ethereum": CHAIN.ETHEREUM,
	"base": CHAIN.BASE,
	"bnb": CHAIN.BSC,
	"sonic": CHAIN.SONIC,
	"tron": CHAIN.TRON,
};

const prefetch = async (options: FetchOptions): Promise<any> => {
	// must exclude all blacklisted tokens
	const ethereumBlacklistedTokens = getDefaultDexTokensBlacklisted(CHAIN.ETHEREUM)
	const bscBlacklistedTokens = getDefaultDexTokensBlacklisted(CHAIN.BSC)

	const allBlacklistedTokens = ethereumBlacklistedTokens.concat(bscBlacklistedTokens)

	const data: IData[] = await queryDuneSql(options, `
		SELECT
			chain,
			fromToken as token,
			SUM(fromAmount) as amount
		FROM liquidmesh_multichain.liquidmeshrouter_evt_orderrecord
		WHERE
			evt_block_time >= from_unixtime(${options.startTimestamp})
			AND evt_block_time < from_unixtime(${options.endTimestamp})
			AND fromToken NOT IN (${allBlacklistedTokens.toString()})
			AND toToken NOT IN (${allBlacklistedTokens.toString()})
			AND fromAmount < UINT256 '115792089237316195423570985008687907853269984665640564039457584007913129639935'
		GROUP BY chain, fromToken
	`)

	return data;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const dailyVolume = options.createBalances()

	const tokensAndAmounts: Array<IData> = options.preFetchedResults || []

	const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
	const whitesliedTokens = await getDefaultDexTokensWhitelisted({ chain: options.chain })
	for (const token of tokensAndAmounts.filter(item => options.chain === chainsMap[item.chain] && item.token !== '0x0000000000000000000000000000000000000000')) {
		if (options.chain === CHAIN.BSC) {
			if (whitesliedTokens.includes(formatAddress(token.token))) {
				dailyVolume.add(token.token, token.amount);
			}
		} else {
			if (!blacklistedTokens.includes(formatAddress(token.token))) {
				dailyVolume.add(token.token, token.amount);
			}
		}
	}

	return {
		dailyVolume,
	};
};

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
	const dailyVolume = options.createBalances()

  const blacklistTokens = getDefaultDexTokensBlacklisted(options.chain);
	
	const tokensAndAmounts: Array<IData> = await queryDuneSql(options, `
		SELECT
			'solana' AS chain,
			(CASE
				WHEN source_token_mint = '11111111111111111111111111111111' THEN 'So11111111111111111111111111111111111111112'
				ELSE source_token_mint
			END) AS token,
			SUM(amount_in) as amount
		FROM liquidmesh_solana.liquid_mesh_router_evt_liquidmeshswapevent
		WHERE
			evt_block_time >= from_unixtime(${options.startTimestamp})
			AND evt_block_time < from_unixtime(${options.endTimestamp})
		GROUP BY source_token_mint
	`)

	for (const item of tokensAndAmounts) {
		dailyVolume.add(item.token, item.amount);
	}

	for (const t of blacklistTokens) {
	  dailyVolume.removeTokenBalance(t)
	}
	
	return {
		dailyVolume,
	};
};

const adapter: SimpleAdapter = {
	version: 1,
	dependencies: [Dependencies.DUNE],
	start: '2025-08-01',
	adapter: Object.values(chainsMap).reduce((acc, chain) => {
		return {
			...acc,
			[chain]: {
				fetch: fetch,
			},
		};
	}, {
		solana: {
			fetch: fetchSolana,
		}
	}),
	prefetch: prefetch,
	methodology: {
		Volume: "Tracks the trading volume across all supported chains through LiquidMesh aggregator",
	},
	isExpensiveAdapter: true,
}

export default adapter
