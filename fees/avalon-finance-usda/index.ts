import { Adapter, FetchOptions, FetchResultV2 } from '../../adapters/types'
import { Balances } from '@defillama/sdk'

const config = {
	ethereum: {
		poolAddress: '0x3f390dD6EF69f68f9877aACC086856a200808693',
		usdaAddress: '0x0b4D6DA52dF60D44Ce7140F1044F2aD5fabd6316',
		start: '2024-10-17',
	},
	bsc: {
		poolAddress: '0xC757E47d6bC20FEab54e16F2939F51Aa4826deF7',
		usdaAddress: '0x8a4bA6C340894B7B1De0F6A03F25Aa6afb7f0224',
		start: '2024-11-03',
	},
	mantle: {
		poolAddress: '0x8f778806CBea29F0f64BA6A4B7724BCD5EEd543E',
		usdaAddress: '0x2BDC204b6d192921605c66B7260cFEF7bE34Eb2E',
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

// ABI for protocol profit accumulate
const abi = 'function protocolProfitAccumulate() returns (uint256)'
const decimals = 18

//@dev USDa is not verified on all chains, so we need to add it manually.
/**
 * Fetches the total accumulated protocol profit for a given chain.
 * @param options FetchOptions provided by the adapter framework
 * @param totalProtocolRevenue Balances object to accumulate results
 */
async function addProtocolProfitAccumulate(options: FetchOptions, totalProtocolRevenue: Balances) {
	const { poolAddress, usdaAddress } = config[options.chain]
	const [protocolProfitAccumulate] = await options.api.multiCall({
		abi,
		calls: [{ target: poolAddress }],
	})
	totalProtocolRevenue.add(usdaAddress, protocolProfitAccumulate)
}

/**
 * Main fetch function for the adapter. Returns protocol revenue for the chain.
 */
async function fetch(options: FetchOptions): Promise<FetchResultV2> {
	const totalProtocolRevenue = options.createBalances()
	await addProtocolProfitAccumulate(options, totalProtocolRevenue)
	return { totalProtocolRevenue }
}

const methodology = `Total protocol revenue from protocol profit accumulate. Profit comes from the borrow interest.`

// Build the adapter object dynamically for all chains in config
const adapter: Adapter = {
	adapter: Object.fromEntries(
		Object.entries(config).map(([chain, { start }]) => [
			chain,
			{
				fetch,
				start,
				meta: { methodology },
			},
		])
	),
	version: 2,
}

export default adapter
