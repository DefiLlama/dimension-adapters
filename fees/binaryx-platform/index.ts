import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// https://binaryx-1.gitbook.io/documentation
const propertyFactoryAddress = '0x5d618C67674945081824e7473821A79E4ec0970F';
const priceOracleAddress = '0x551C261eFcf109378D101de9A2741FB8078Abf45';
const offPlanFactoryAddress = '0x2718fe8eEB091301d1f3D367231aFfE95C2f68Fe';
const offPlanServiceAddress = '0xe442Aa8dC9D8526d7ccDDF4f3f8369294EAfA9dC';
const marketplaceAddress = '0x4e209d2a48262ddde5525b9f0b2cdacabb156e97';
const rentTrackerAddress = '0x326fdcca0f5b9f5905f6bfdb914b1f6eddc45061';

const USDT = ADDRESSES.polygon.USDT;

// https://binaryx-1.gitbook.io/documentation/bnrx-token/staking-overview
// https://binaryx-1.gitbook.io/documentation/asset-tokens/tokenization-process
// https://binaryx-1.gitbook.io/documentation/asset-tokens/getting-regular-rewards
// Tokenization: 85% owner, 8% platform, 6% repair pool, 1% audit oracle
const TOKENIZATION_TOTAL_FEE_BPS = 1500n;  // 15%
const PLATFORM_FEE_BPS = 800n;  // 8%
const BPS_DENOMINATOR = 10000n;
const RENT_PLATFORM_NUM = 2n;
const RENT_HOLDER_SHARE = 80n;

const PRECISION_18 = BigInt(1e18);
const PRECISION_6 = BigInt(1e6);


const abis = {
	getPointersPaginated: 'function getPointersPaginated(uint256 page, uint256 perPage) view returns (address[] pointers, uint256 totalCount)',
	getSellProgress: 'function getSellProgress(address offPlan) view returns (tuple(uint256 tokensSoldD18, uint256 amountInUsdCollectedD18, uint256 amountInUsdLeftToCollectD18, uint256 tokensLeftD18))',
	getAssets: 'address[]:getAssets',
	latestPrice: 'function latestPrice(address asset) view returns (uint256)',
	totalSupply: 'erc20:totalSupply',
};

const events = {
	Claimed: 'event Claimed(address indexed account, uint256 amount, uint256 timestamp)',
	OrderFulfilled: 'event OrderFulfilled((uint256,address,address,uint256,uint256,uint256,uint8,uint8,uint256,uint256,uint8),uint256,uint256,uint256,uint256,uint256,address)',
};

async function fetchAllOffPlanAssets(api: any) {
	const pageSize = 100;
	let page = 0;
	let allOffPlanAssets: string[] = [];

	while (true) {
		const { pointers, totalCount } = await api.call({
			target: offPlanFactoryAddress,
			abi: abis.getPointersPaginated,
			params: [page, pageSize],
		});

		if (pointers.length > 0) {
			allOffPlanAssets = [...allOffPlanAssets, ...pointers];
		}

		if (allOffPlanAssets.length >= totalCount || pointers.length === 0) break;
		page++;
	}

	return allOffPlanAssets;
}

// 15% of new off-plan property investments: 8% platform, 6% repair pool, 1% audit oracle
async function calculateOffPlanTokenizationFees(options: FetchOptions, dailyFees: any, dailySupplySideRevenue: any, dailyRevenue: any, dailyHoldersRevenue: any, dailyProtocolRevenue: any) {
	const allOffPlanAssets = await fetchAllOffPlanAssets(options.api);
	if (allOffPlanAssets.length === 0) return;

	const [progressBefore, progressAfter] = await Promise.all([
		options.fromApi.multiCall({ abi: abis.getSellProgress, calls: allOffPlanAssets, target: offPlanServiceAddress, permitFailure: true }),
		options.toApi.multiCall({ abi: abis.getSellProgress, calls: allOffPlanAssets, target: offPlanServiceAddress, permitFailure: true }),
	]);

	for (let i = 0; i < allOffPlanAssets.length; i++) {
		if (!progressBefore[i] || !progressAfter[i]) continue;

		const collectedBefore = BigInt(progressBefore[i].amountInUsdCollectedD18);
		const collectedAfter = BigInt(progressAfter[i].amountInUsdCollectedD18);
		if (collectedAfter <= collectedBefore) continue;

		const newInvestment = collectedAfter - collectedBefore;
		const totalFee = (newInvestment * TOKENIZATION_TOTAL_FEE_BPS / BPS_DENOMINATOR) * PRECISION_6 / PRECISION_18;
		const platformFee = (newInvestment * PLATFORM_FEE_BPS / BPS_DENOMINATOR) * PRECISION_6 / PRECISION_18;

		dailyFees.add(USDT, totalFee, 'Tokenization Fees');
		dailySupplySideRevenue.add(USDT, totalFee - platformFee, 'Tokenization Fees of repair pool and audit oracle');
		dailyRevenue.add(USDT, platformFee, 'Tokenization Fees');
		dailyHoldersRevenue.add(USDT, platformFee * 70n / 100n, 'Tokenization Fees to holders');
		dailyProtocolRevenue.add(USDT, platformFee * 30n / 100n, 'Tokenization Fees to protocol');
	}
}

// 15% of new rental property token purchases: 8% platform, 6% repair pool, 1% audit oracle
async function calculateRentalTokenizationFees(options: FetchOptions, dailyFees: any, dailySupplySideRevenue: any, dailyRevenue: any, dailyHoldersRevenue: any, dailyProtocolRevenue: any) {
	const rentalAssets: string[] = await options.api.call({ target: propertyFactoryAddress, abi: abis.getAssets });
	if (rentalAssets.length === 0) return;

	const [suppliesBefore, suppliesAfter, prices] = await Promise.all([
		options.fromApi.multiCall({ abi: abis.totalSupply, calls: rentalAssets, permitFailure: true }),
		options.toApi.multiCall({ abi: abis.totalSupply, calls: rentalAssets, permitFailure: true }),
		options.toApi.multiCall({ abi: abis.latestPrice, calls: rentalAssets, target: priceOracleAddress, permitFailure: true }),
	]);

	for (let i = 0; i < rentalAssets.length; i++) {
		if (!suppliesBefore[i] || !suppliesAfter[i] || !prices[i]) continue;

		const supplyBefore = BigInt(suppliesBefore[i]);
		const supplyAfter = BigInt(suppliesAfter[i]);
		if (supplyAfter <= supplyBefore) continue;

		const newTokens = supplyAfter - supplyBefore;
		const price = BigInt(prices[i]);
		const newInvestment = (newTokens * price) / PRECISION_18;
		const totalFee = (newInvestment * TOKENIZATION_TOTAL_FEE_BPS) / BPS_DENOMINATOR;
		const platformFee = (newInvestment * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;

		dailyFees.add(USDT, totalFee, 'Tokenization Fees');
		dailySupplySideRevenue.add(USDT, totalFee - platformFee, 'Tokenization Fees of repair pool and audit oracle');
		dailyRevenue.add(USDT, platformFee, 'Tokenization Fees');
		dailyHoldersRevenue.add(USDT, platformFee * 70n / 100n, 'Tokenization Fees to holders');
		dailyProtocolRevenue.add(USDT, platformFee * 30n / 100n, 'Tokenization Fees to protocol');
	}
}

// Rental income fees: total rental income is the gross fee, split as 80% token holders + 18% management oracle + 2% platform
// Claimed amount from RentTracker = 80% of total rent
async function calculateRentalIncomeFees(options: FetchOptions, dailyFees: any, dailySupplySideRevenue: any, dailyRevenue: any, dailyHoldersRevenue: any, dailyProtocolRevenue: any) {
	const claimedLogs = await options.getLogs({
		target: rentTrackerAddress,
		eventAbi: events.Claimed,
	});

	let totalClaimed = 0n;
	for (const log of claimedLogs) {
		totalClaimed += BigInt(log.amount);
	}

	if (totalClaimed === 0n) return;

	// Claimed = 80% of total rent → total rent = claimed / 80 * 100
	const totalRent = (totalClaimed * 100n) / RENT_HOLDER_SHARE;
	const platformFee = (totalRent * RENT_PLATFORM_NUM) / 100n;

	// dailyFees = total rental income (100%)
	dailyFees.add(USDT, totalRent, 'Rental Income');
	// dailySupplySideRevenue = 80% to token holders + 18% to management oracle = 98%
	dailySupplySideRevenue.add(USDT, totalRent - platformFee, 'Rental Income to token holders and management oracle');
	// dailyRevenue = 2% platform fee
	dailyRevenue.add(USDT, platformFee, 'Rental Income');
	// 70% of platform fee to BNRX stakers, 30% to treasury
	dailyHoldersRevenue.add(USDT, platformFee * 70n / 100n, 'Rental Income to holders');
	dailyProtocolRevenue.add(USDT, platformFee * 30n / 100n, 'Rental Income to protocol');
}

// marketplace fee from OrderFulfilled events
async function calculateMarketplaceFees(options: FetchOptions, dailyFees: any, dailyRevenue: any, dailyHoldersRevenue: any, dailyProtocolRevenue: any) {
	const fulfilledLogs = await options.getLogs({
		target: marketplaceAddress,
		eventAbi: events.OrderFulfilled,
	});

	let totalFees = 0n;
	for (const log of fulfilledLogs) {
		totalFees += BigInt(log[5]);
	}

	if (totalFees === 0n) return;

	dailyFees.add(USDT, totalFees, 'Marketplace Fees');
	dailyRevenue.add(USDT, totalFees, 'Marketplace Fees');
	dailyHoldersRevenue.add(USDT, totalFees * 70n / 100n, 'Marketplace Fees to holders');
	dailyProtocolRevenue.add(USDT, totalFees * 30n / 100n, 'Marketplace Fees to protocol');
}

const fetch = async (options: FetchOptions) => {
	const dailyFees = options.createBalances();
	const dailySupplySideRevenue = options.createBalances();
	const dailyRevenue = options.createBalances();
	const dailyHoldersRevenue = options.createBalances();
	const dailyProtocolRevenue = options.createBalances();

	await calculateOffPlanTokenizationFees(options, dailyFees, dailySupplySideRevenue, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue)
	await calculateRentalTokenizationFees(options, dailyFees, dailySupplySideRevenue, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue)
	await calculateRentalIncomeFees(options, dailyFees, dailySupplySideRevenue, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue)
	await calculateMarketplaceFees(options, dailyFees, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue)

	return {
		dailyFees,
		dailySupplySideRevenue,
		dailyRevenue,
		dailyHoldersRevenue,
		dailyProtocolRevenue,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	adapter: {
		[CHAIN.POLYGON]: {
			fetch,
			start: "2024-06-01",
		},
	},
	methodology: {
		Fees: "15% tokenization fee on new property investments (8% platform + 6% repair pool + 1% audit oracle), total rental income from tokenized properties, and 2.5% of secondary marketplace trades.",
		Revenue: "8% tokenization fees, 2% platform share of rental income, and 2.5% marketplace fees.",
		ProtocolRevenue: "30% of platform revenue retained by the Binaryx treasury.",
		SupplySideRevenue: "7% of tokenization investments (6% repair pool + 1% audit oracle) and 98% of rental income (80% token holders + 18% management oracles).",
		HoldersRevenue: "70% of platform revenue (tokenization, rental platform fee, marketplace) distributed to BNRX token stakers.",
	},
	breakdownMethodology: {
		Fees: {
			'Tokenization Fees': "15% of funds collected from new property investments (8% platform + 6% repair pool + 1% audit oracle), derived from on-chain sell progress and token supply changes.",
			'Rental Income': "Total rental income from tokenized properties, derived from on-chain rent claim events on the RentTracker contract.",
			'Marketplace Fees': "2.5% fee on secondary marketplace trades, derived from OrderFulfilled events on the Marketplace contract.",
		},
		Revenue: {
			'Tokenization Fees': "8% tokenization fees retained by the Binaryx ecosystem.",
			'Rental Income': "2% platform share of rental income.",
			'Marketplace Fees': "2.5% marketplace fees retained by the Binaryx ecosystem.",
		},
		ProtocolRevenue: {
			'Tokenization Fees to protocol': "30% of tokenization fees retained by Binaryx treasury.",
			'Rental Income to protocol': "30% of the 2% platform rental fee retained by Binaryx treasury.",
			'Marketplace Fees to protocol': "30% of marketplace fees retained by Binaryx treasury.",
		},
		SupplySideRevenue: {
			'Tokenization Fees of repair pool and audit oracle': "7% of tokenization investments: 6% to repair pool and 1% to audit oracle.",
			'Rental Income to token holders and management oracle': "98% of rental income: 80% to property token holders and 18% to management oracles.",
		},
		HoldersRevenue: {
			'Tokenization Fees to holders': "70% of tokenization fees distributed to BNRX stakers.",
			'Rental Income to holders': "70% of the 2% platform rental fee distributed to BNRX stakers.",
			'Marketplace Fees to holders': "70% of marketplace fees distributed to BNRX stakers.",
		},
	},
};

export default adapter;
