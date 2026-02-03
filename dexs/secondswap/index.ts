import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

const purchase_event = 'event Purchased(address indexed vestingPlan, uint256 indexed listingId, address buyer, uint256 amount, address referral, uint256 buyerFee, uint256 sellerFee, uint256 referralReward)'

const chainConfig = {
	[CHAIN.ETHEREUM]: {
		contract: '0xd22a74f34d8b5b85a813b4b6953e4b8951b2d0a5',
		start: '2025-02-26',
		feeTokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
	},
	[CHAIN.AVAX]: {
		contract: '0xEbDcdC0D90bd074a7dDDc450b2308b71cB29714F',
		start: '2025-04-08',
		feeTokenAddress: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
	},
	// [CHAIN.SOLANA]: {
	// 	contract: '0x0000000000000000000000000000000000000000',
	// 	start: '2025-02-27'
	// },
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
	const config = chainConfig[options.chain];
	
	const [purchase_events, settingContractResult] = await Promise.all([
		options.getLogs({
			target: config.contract,
			eventAbi: purchase_event,
		}),
		options.api.call({
			target: config.contract,
			abi: 'function marketplaceSetting() view returns (address)',
		}),
	]);

	const settingContract = settingContractResult;
	
	const [buyerFeeResult, sellerFeeResult] = await Promise.all([
		options.api.call({
			target: settingContract,
			abi: 'function buyerFee() view returns (uint256)',
		}),
		options.api.call({
			target: settingContract,
			abi: 'function sellerFee() view returns (uint256)',
		}),
	]);

	const buyerFeeBps = Number(buyerFeeResult);
	const sellerFeeBps = Number(sellerFeeResult);
	
	const dailyFees = options.createBalances();
	const dailyVolume = options.createBalances();

	for (const event of purchase_events) {
		const totalFees = Number(event.buyerFee) + Number(event.sellerFee);
		dailyFees.add(config.feeTokenAddress, totalFees, METRIC.TRADING_FEES);
		
		const buyerVolume = buyerFeeBps > 0 ? (Number(event.buyerFee) * 10000) / buyerFeeBps : 0;
		const sellerVolume = sellerFeeBps > 0 ? (Number(event.sellerFee) * 10000) / sellerFeeBps : 0;
		const totalVolume = buyerVolume + sellerVolume;
		
		dailyVolume.add(config.feeTokenAddress, totalVolume);
	}

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue: dailyFees,
	}
};

const methodology = {
	Fees: "SecondSwap facilitates trading of locked/vesting tokens. Trading fees paid by buyers and sellers on each spot purchase transaction.",
	Revenue: "SecondSwap currently retains 100% of trading fees as protocol revenue.",
};

const breakdownMethodology = {
	Fees: {
		[METRIC.TRADING_FEES]: "Trading fees paid by buyers and sellers on each spot purchase transaction.",
	},
}

const adapter: SimpleAdapter = {
	fetch,
	adapter: chainConfig,
	methodology,
	breakdownMethodology
};

export default adapter
