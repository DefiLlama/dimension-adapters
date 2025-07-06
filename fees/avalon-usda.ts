import { Adapter, FetchOptions, FetchResultV2 } from '../adapters/types'

const configs: any = {
	ethereum: {
		poolAddress: '0x3f390dD6EF69f68f9877aACC086856a200808693',
		usdaAddress: '0x8A60E489004Ca22d775C5F2c657598278d17D9c2',
		start: '2024-10-17',
	},
	bsc: {
		poolAddress: '0xC757E47d6bC20FEab54e16F2939F51Aa4826deF7',
		usdaAddress: '0x9356086146be5158E98aD827E21b5cF944699894',
		start: '2024-11-03',
	},
	mantle: {
		poolAddress: '0x8f778806CBea29F0f64BA6A4B7724BCD5EEd543E',
		usdaAddress: '0x075df695b8E7f4361FA7F8c1426C63f11B06e326',
		start: '2024-10-18',
	},
	sonic: {
		poolAddress: '0x74476697b5FFd19c8CD9603C01527Dcb987C7418',
		usdaAddress: '0xff12470a969dd362eb6595ffb44c82c959fe9acc',
		start: '2025-01-20',
	},
	berachain: {
		poolAddress: '0x02feDCff97942fe28e8936Cdc3D7A480fdD248f0',
		usdaAddress: '0xff12470a969dd362eb6595ffb44c82c959fe9acc',
		start: '2025-04-02',
	},
	klaytn: {
		poolAddress: '0x45f842F1F7e576cB9BF7E1d50Ccc4D2ea378dbeF',
		usdaAddress: '0xdc3cf1961b08da169b078f7df6f26676bf6a4ff6',
		start: '2025-06-15',
	},
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
	const dailyFees = options.createBalances()
	const { poolAddress, usdaAddress } = configs[options.chain]
	const protocolProfitAccumulateBefore = await options.fromApi.call({
		abi: 'function protocolProfitAccumulate() returns (uint256)',
		target: poolAddress,
	})
	const protocolProfitAccumulateAfter = await options.toApi.call({
		abi: 'function protocolProfitAccumulate() returns (uint256)',
		target: poolAddress,
	})

	console.log(options.chain, poolAddress, protocolProfitAccumulateBefore, protocolProfitAccumulateAfter)

	dailyFees.add(usdaAddress, Number(protocolProfitAccumulateAfter) - Number(protocolProfitAccumulateBefore))

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
				meta: { methodology },
			},
		])
	),
	version: 2,
}

export default adapter
