import { Adapter, FetchV2 } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const abi = {
	getPoolManagerReserveInformation:
		'function getPoolManagerReserveInformation() view returns (tuple(uint256 userAmount, uint256 collateral, uint256 debt, uint256 claimableUSDT, uint256 claimableBTC) poolManagerReserveInfor)',
	getPoolManagerConfig:
		'function getPoolManagerConfig() view returns (tuple(uint256 DEFAULT_LTV, uint256 DEFAULT_LIQUIDATION_THRESHOLD, uint256 DEFAULT_POOL_INTEREST_RATE, uint256 DEFAULT_PROTOCOL_INTEREST_RATE, address USDT, address FBTC0, address FBTC1, address FBTCOracle, address AvalonUSDTVault, address AntaphaUSDTVault))',
}

const poolAddress = '0x02feDCff97942fe28e8936Cdc3D7A480fdD248f0'

export default {
	adapter: {
		[CHAIN.ETHEREUM]: {
			fetch: (async ({ api, createBalances }) => {
				const dailyFees = createBalances()
				const dailyRevenue = createBalances()

				// Get the pool manager configuration
				const poolManagerConfig = await api.call({
					target: poolAddress,
					abi: abi.getPoolManagerConfig,
				})
				const poolManagerReserveInformation = await api.call({
					target: poolAddress,
					abi: abi.getPoolManagerReserveInformation,
				})

				// Protocol Fee = PoolManagerReserveInformation.debt * PoolManagerConfig.DEFAULT_PROTOCOL_INTEREST_RATE
				// DEFAULT_PROTOCOL_INTEREST_RATE decimals = 4
				const amount = poolManagerReserveInformation.debt * poolManagerConfig.DEFAULT_PROTOCOL_INTEREST_RATE / 1e4


				dailyFees.addUSDValue(amount)
				dailyRevenue.addUSDValue(amount)

				return { dailyFees, dailyRevenue }
			}) as FetchV2,
			start: 1722088222,
		},
	},
	version: 2,
} as Adapter
