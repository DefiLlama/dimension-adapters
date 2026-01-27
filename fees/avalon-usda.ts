import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types'
import ADDRESSES from '../helpers/coreAssets.json'

const configs: any = {
	ethereum: {
		// V2: FBTC <> USDa
		poolAddress: '0x3f390dD6EF69f68f9877aACC086856a200808693',
		feeTokenAddress: '0x8A60E489004Ca22d775C5F2c657598278d17D9c2', // USDa
		start: '2024-10-17',
	},
	bsc: {
		// V2: FBTC <> USDa
		poolAddress: '0xC757E47d6bC20FEab54e16F2939F51Aa4826deF7',
		feeTokenAddress: '0x9356086146be5158E98aD827E21b5cF944699894', // USDa
		start: '2024-11-03',
	},
	mantle: {
		// V2: FBTC <> USDa
		poolAddress: '0x8f778806CBea29F0f64BA6A4B7724BCD5EEd543E',
		feeTokenAddress: '0x075df695b8E7f4361FA7F8c1426C63f11B06e326', // USDa
		start: '2024-10-18',
	},
	sonic: {
		// V2: FBTC <> USDa
		poolAddress: '0x74476697b5FFd19c8CD9603C01527Dcb987C7418',
		feeTokenAddress: '0xff12470a969dd362eb6595ffb44c82c959fe9acc', // USDa
		start: '2025-01-20',
	},
	berachain: {
		// V3: WFBTC <> USDa
		poolAddress: '0x02feDCff97942fe28e8936Cdc3D7A480fdD248f0',
		feeTokenAddress: '0xff12470a969dd362eb6595ffb44c82c959fe9acc', // USDa
		start: '2025-04-02',
	},
	klaytn: {
		// V23: WFBTC <> USDa
		poolAddress: '0x45f842F1F7e576cB9BF7E1d50Ccc4D2ea378dbeF',
		feeTokenAddress: '0xdc3cf1961b08da169b078f7df6f26676bf6a4ff6', // USDa
		start: '2025-06-15',
	},
}

const v1Configs: any = {
	ethereum: {
		// V1: FBTC <> USDT
		poolAddress: '0x02feDCff97942fe28e8936Cdc3D7A480fdD248f0',
		feeTokenAddress: ADDRESSES.ethereum.USDT, // USDT
		start: '2024-07-27',
	},
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
	const dailyFees = options.createBalances()
	const { poolAddress, feeTokenAddress } = configs[options.chain]
	const protocolProfitAccumulateBefore = await options.fromApi.call({
		abi: 'function protocolProfitAccumulate() returns (uint256)',
		target: poolAddress,
	})

	const protocolProfitAccumulateAfter = await options.toApi.call({
		abi: 'function protocolProfitAccumulate() returns (uint256)',
		target: poolAddress,
	})

	dailyFees.add(feeTokenAddress, Number(protocolProfitAccumulateAfter) - Number(protocolProfitAccumulateBefore))

	// @dev Ethereum has both V1 and V2 pools, so we need to add the fees from the V1 pool
	if (options.chain === 'ethereum') {
		const { poolAddress: v1PoolAddress, feeTokenAddress: v1FeeTokenAddress } = v1Configs[options.chain]
		const protocolProfitAccumulateBefore = await options.fromApi.call({
			abi: 'function getProtocolProfitAccumulate() returns (uint256)',
			target: v1PoolAddress,
		})

		const protocolProfitAccumulateAfter = await options.toApi.call({
			abi: 'function getProtocolProfitAccumulate() returns (uint256)',
			target: v1PoolAddress,
		})

		dailyFees.add(v1FeeTokenAddress, Number(protocolProfitAccumulateAfter) - Number(protocolProfitAccumulateBefore))
	}

	return {
		dailyFees,
		dailyRevenue: dailyFees,
		dailyProtocolRevenue: dailyFees,
	}
}

const methodology = {
	Fees: 'Total interest paid by borrowers.',
	Revenue: 'All interest paid by borrowers.',
	ProtocolRevenue: 'All interest paid by borrowers were collected by Avalon.',
}

const adapter: Adapter = {
	adapter: Object.fromEntries(
		Object.entries(configs).map(([chain, config]) => [
			chain,
			{
				fetch,
				start: (config as any).start,
			},
		])
	),
	version: 2,
	methodology,
}

export default adapter
