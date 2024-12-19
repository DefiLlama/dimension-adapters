import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async ({ createBalances, getLogs }: FetchOptions) => {
	const logs = await getLogs({ eventAbi: abi.FeePaid, target: '0xebbae847ae3eac6a09f228d8bf921db2d5f4d43d' })
	const dailyFees = createBalances()
	logs.forEach((log: any) => {
		dailyFees.add(log.asset, log.fee)
	})
	return {
		dailyFees,
	};
}

const abi = {
	"FeePaid": "event FeePaid(uint256 indexed orderId, address indexed user, address indexed asset, string market, uint256 fee, uint256 poolFee, uint256 stakingFee, uint256 treasuryFee, uint256 keeperFee, bool isLiquidation)",
	"PositionIncreased": "event PositionIncreased(uint256 indexed orderId, address indexed user, address indexed asset, string market, bool isLong, uint256 size, uint256 margin, uint256 price, uint256 positionMargin, uint256 positionSize, uint256 positionPrice, int256 fundingTracker, uint256 fee)",
}

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.ARBITRUM]: {
			fetch,
			start: '2024-01-10',
		},
	},
};

export default adapter;
