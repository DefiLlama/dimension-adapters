import { httpGet } from "../../utils/fetchURL";
import { Adapter, FetchResultIncentives, ProtocolType, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

const BASE_REWARD = 50
const HALVING_BLOCKS = 210000
const getBCHRewardByBlock = (block: number) => BASE_REWARD / Math.pow(2, Math.floor(block / HALVING_BLOCKS))

const getIncentives: FetchV2 = async (options: FetchOptions): Promise<FetchResultIncentives> => {
	const startOfDay = options.startOfDay;
	const date = new Date(startOfDay * 1000).toISOString().slice(0, 10)

	let allBlocks: any[] = []
	let offset = 0
	while (true) {
		const response = await httpGet(`https://api.blockchair.com/bitcoin-cash/blocks?q=time(${date})&s=id(desc)&limit=100&offset=${offset}`)
		const blocks = response.data
		if (!blocks || blocks.length === 0) break
		allBlocks = allBlocks.concat(blocks)
		if (blocks.length < 100) break
		offset += 100
	}

	if (allBlocks.length === 0) {
		throw new Error(`No BCH blocks found for timestamp ${options.toTimestamp}`)
	}

	const rewardByBlock = getBCHRewardByBlock(allBlocks[0].id)
	const totalReward = allBlocks.length * rewardByBlock
	const tokenIncentives = await sdk.Balances.getUSDString({ 'coingecko:bitcoin-cash': totalReward }, options.toTimestamp)

	return {
		block: allBlocks[0].id,
		tokenIncentives,
	}
}

const adapter: Adapter = {
	adapter: {
		[CHAIN.BITCOIN_CASH]: {
			fetch: getIncentives,
			start: '2017-08-01',
		},
	},
	protocolType: ProtocolType.CHAIN
}

export default adapter
