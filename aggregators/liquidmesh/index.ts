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

const ExcludeTxns: Array<string> = [
	'0x028cb1c81b8fefd8b9746e76e8e62ed3cfd7ad91e0bb3ef913f155299f562491',
	'0x1ac7c39d9f9772e7e318e08057d69d71281caf2f837d7aacc9a7c848146d8b3a',
	'0xbd76d7c9dbad2eaf565ee9140c118ad6182bf3fdb56ab3b00c4bb90426abded0',
	'0xa51d62e0372ce52b73366efeda99473f4f57d8cb45bc27d4898ca41e1a933b79',
	'0xf469df5649084d5028dce9037a055ab784e94ec2cb2f0f80c22b8e0101612194',
	'0x6f8253da458212d0f2924a24df969561c7fdb134df310687ec200b720e769658',
	'0x6ca69c2e57e67c07106c3f95700d8dfad9260f0c61ac19423a149f8f3ab471cd',
	'0xe1d89b68828097d506e9dded1cc2e06742c42688ad51d99395aee640831bad4b',
]

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
			AND evt_tx_hash NOT IN (${ExcludeTxns.toString()})
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
