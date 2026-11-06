import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";
import { getDefaultDexTokensBlacklisted, getDefaultDexTokensWhitelisted } from "../../helpers/lists";
import { formatAddress } from "../../utils/utils";
import { evmToTronAddress } from "@defillama/sdk/build/generalUtil";

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
	"arbitrum": CHAIN.ARBITRUM,
	"polygon": CHAIN.POLYGON,
	"robinhood": CHAIN.ROBINHOOD,
	"monad": CHAIN.MONAD,
	"plasma": CHAIN.PLASMA,
};

// The router runs at the same address on these chains (https://docs.liquidmesh.io/docs/smart-contracts), but Dune has
// no decoded table for them, so OrderRecord is read from raw logs. Its six data words: orderId, fromToken, toToken,
// sender, fromAmount, returnAmount.
const ROUTER = '0x3d90f66b534dd8482b181e24655a9e8265316be9';
const ORDER_RECORD_TOPIC = '0xe5b9f85c5caca875a8b78e5b2d88de86d7793cbff3d81ea4ecbec4c2b9ad7beb';
const RAW_LOG_CHAINS = ['arbitrum', 'polygon', 'robinhood', 'monad', 'plasma'];
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

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
		UNION ALL
		SELECT
			blockchain AS chain,
			varbinary_substring(data, 45, 20) AS token,
			SUM(bytearray_to_uint256(varbinary_substring(data, 129, 32))) AS amount
		FROM evms.logs
		WHERE
			blockchain IN (${RAW_LOG_CHAINS.map(c => `'${c}'`).join(', ')})
			AND block_date >= date(from_unixtime(${options.startTimestamp}))
			AND block_date <= date(from_unixtime(${options.endTimestamp}))
			AND block_time >= from_unixtime(${options.startTimestamp})
			AND block_time < from_unixtime(${options.endTimestamp})
			AND contract_address = ${ROUTER}
			AND topic0 = ${ORDER_RECORD_TOPIC}
			AND bytearray_length(data) >= 192
			AND varbinary_substring(data, 45, 20) NOT IN (${allBlacklistedTokens.toString()})
			AND varbinary_substring(data, 77, 20) NOT IN (${allBlacklistedTokens.toString()})
			AND bytearray_to_uint256(varbinary_substring(data, 129, 32)) < UINT256 '115792089237316195423570985008687907853269984665640564039457584007913129639935'
		GROUP BY 1, 2
	`)

	return data;
};

const fetch = async (options: FetchOptions) => {
	const dailyVolume = options.createBalances()

	const tokensAndAmounts: Array<IData> = options.preFetchedResults || []

	const blacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
	const whitesliedTokens = options.chain === CHAIN.BSC ? await getDefaultDexTokensWhitelisted({ chain: options.chain }) : []
	for (const token of tokensAndAmounts.filter(item => options.chain === chainsMap[item.chain] && item.token !== ADDRESSES.null)) {
		if (formatAddress(token.token) === NATIVE) {
			dailyVolume.addGasToken(token.amount);
		} else if (options.chain === CHAIN.BSC) {
			if (whitesliedTokens.includes(formatAddress(token.token))) {
				dailyVolume.add(token.token, token.amount);
			}
		} else if (options.chain === CHAIN.TRON) {
			// Dune returns hex addresses; Tron prices are keyed by base58
			dailyVolume.add(evmToTronAddress(token.token), token.amount);
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

const fetchSolana = async (options: FetchOptions) => {
	const dailyVolume = options.createBalances()

  const blacklistTokens = ['2xaPstY4XqJ2gUA1mpph3XmvmPZGuTuJ658AeqX3gJ6F', 'Dsx5h4jk8vyQjd8B9JF9cydNTz87KgPqUG2QCGH9PjCh']
	
	const tokensAndAmounts: Array<IData> = await queryDuneSql(options, `
		SELECT
			'solana' AS chain,
			(CASE
				WHEN source_token_mint = '11111111111111111111111111111111' THEN '${ADDRESSES.solana.SOL}'
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
		[CHAIN.SOLANA]: {
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
