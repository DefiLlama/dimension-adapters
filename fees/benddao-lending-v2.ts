import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://docs.benddao.xyz/portal
// https://github.com/BendDAO/bend-v2
// https://github.com/BendDAO/bend-v2/blob/63f0953173acc760323fcbb2414f215a82dd5217/release/deployments/mainnet.json
const POOL_MANAGER = "0x0b870d974fB968B2E06798ABBD2563c80933D148";
const POOL_LENS = "0x4643f7791ac622863503d8d3e62942fcff592a91";
const SECONDS_PER_YEAR = 31536000;

const abis = {
	getPoolList: "function getPoolList() view returns (uint256[])",
	getPoolAssetList: "function getPoolAssetList(uint32 poolId) view returns (address[] assets, uint8[] types)",
	getAssetGroupList: "function getAssetGroupList(uint32 poolId, address asset) view returns (uint256[])",
	getAssetFeeData: "function getAssetFeeData(uint32 poolId, address asset) view returns (uint256 feeFactor, uint256 accruedFee, uint256 normAccruedFee)",
	getAssetGroupData: "function getAssetGroupData(uint32 poolId, address asset, uint8 group) view returns (uint256 totalScaledCrossBorrow, uint256 totalCrossBorrow, uint256 totalScaledIsolateBorrow, uint256 totalIsolateBorrow, uint256 borrowRate, uint256 borrowIndex, address rateModel)",
};

const events = {
	AssetInterestBorrowDataUpdated: "event AssetInterestBorrowDataUpdated(uint32 indexed poolId, address indexed asset, uint256 groupId, uint256 borrowRate, uint256 borrowIndex)",
	IsolateRedeem: "event IsolateRedeem(address indexed sender, uint256 indexed poolId, address indexed nftAsset, uint256[] tokenIds, address debtAsset, uint256[] redeemAmounts, uint256[] bidFines)",
};

const fetch = async (options: FetchOptions) => {
	const { createBalances, getLogs, api } = options;
	const dailyFees = createBalances();
	const dailyRevenue = createBalances();
	const dailySupplySideRevenue = createBalances();

	// Get all pools
	const pools: string[] = await api.call({ target: POOL_LENS, abi: abis.getPoolList });

	// Fetch event logs
	const [borrowUpdates, redeemLogs] = await Promise.all([
		getLogs({ target: POOL_MANAGER, eventAbi: events.AssetInterestBorrowDataUpdated }),
		getLogs({ target: POOL_MANAGER, eventAbi: events.IsolateRedeem }),
	]);

	// Group last rate by poolId-asset-group
	const lastRateByKey: Record<string, bigint> = {};
	borrowUpdates.forEach((log: any) => {
		const key = `${log.poolId}-${log.asset.toLowerCase()}-${log.groupId}`;
		lastRateByKey[key] = log.borrowRate;
	});

	for (const poolId of pools) {
		// Get assets and their types
		const assetList = await api.call({ target: POOL_LENS, abi: abis.getPoolAssetList, params: [poolId] });
		const assets: string[] = assetList.assets || assetList[0];
		const types: string[] = assetList.types || assetList[1];
		// Filter to ERC20 assets only (type 1) - ERC721s are collateral-only
		const erc20Assets = assets.filter((_, i) => Number(types[i]) === 1);

		// Get fee data and group data for each ERC20 asset
		const [feeResults, groupLists] = await Promise.all([
			Promise.all(erc20Assets.map(asset => api.call({ target: POOL_LENS, abi: abis.getAssetFeeData, params: [poolId, asset] }))),
			Promise.all(erc20Assets.map(asset => api.call({ target: POOL_LENS, abi: abis.getAssetGroupList, params: [poolId, asset] }))),
		]);

		// For each asset, get group borrow data
		for (let i = 0; i < erc20Assets.length; i++) {
			const asset = erc20Assets[i];
			const feeFactor = Number(feeResults[i].feeFactor) / 10000;
			const groups: string[] = groupLists[i];

			if (feeFactor === 0) continue;

			// Sum debt across all groups, weighted by borrow rate
			let totalDebt = 0n;
			let weightedRateSum = 0n;

			for (const groupId of groups) {
				if (Number(groupId) === 0) continue;

				const groupData = await api.call({
					target: POOL_LENS,
					abi: abis.getAssetGroupData,
					params: [poolId, asset, Number(groupId)],
				});

				const crossBorrow = BigInt(groupData.totalCrossBorrow);
				const isolateBorrow = BigInt(groupData.totalIsolateBorrow);
				const groupDebt = crossBorrow + isolateBorrow;

				if (groupDebt === 0n) continue;

				// Use event rate if available, otherwise on-chain state
				const key = `${poolId}-${asset.toLowerCase()}-${groupId}`;
				const rate = lastRateByKey[key] ?? BigInt(groupData.borrowRate);

				totalDebt += groupDebt;
				weightedRateSum += groupDebt * rate;
			}

			if (totalDebt === 0n) continue;

			// Weighted average borrow rate across groups
			const weightedRate = weightedRateSum / totalDebt;
			const annualRate = Number(weightedRate) / 1e27;
			const dailyInterest = BigInt(Math.floor(Number(totalDebt) * annualRate * 86400 / SECONDS_PER_YEAR));

			dailyFees.add(asset, dailyInterest, METRIC.BORROW_INTEREST);
			dailyRevenue.add(asset, BigInt(Math.floor(Number(dailyInterest) * feeFactor)), METRIC.BORROW_INTEREST);
			dailySupplySideRevenue.add(asset, BigInt(Math.floor(Number(dailyInterest) * (1 - feeFactor))), METRIC.BORROW_INTEREST);
		}
	}

	// redeem fines (bid fines go to first bidder, not protocol)
	redeemLogs.forEach((log: any) => {
		const bidFines: bigint[] = log.bidFines;
		bidFines.forEach((fine: bigint) => {
			dailyFees.add(log.debtAsset, fine, METRIC.LIQUIDATION_FEES);
		});
	});

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
		dailySupplySideRevenue,
	};
};

const methodology = {
	Fees: "Interest paid by borrowers across all pools and borrow groups (cross-margin + isolated) + isolate redeem bid fines paid to auction bidders.",
	Revenue: "Protocol's share of borrow interest based on each asset's on-chain fee factor (0-30%).",
	ProtocolRevenue: "Protocol's share of borrow interest based on each asset's on-chain fee factor (0-30%).",
	SupplySideRevenue: "Remaining borrow interest distributed to liquidity providers.",
};

const breakdownMethodology = {
	Fees: {
		[METRIC.BORROW_INTEREST]: "Interest accrued daily on outstanding loans across all pools and groups.",
		[METRIC.LIQUIDATION_FEES]: "Bid fines from IsolateRedeem events, paid by borrowers who redeem during NFT auction, goes to first bidder.",
	},
	Revenue: {
		[METRIC.BORROW_INTEREST]: "Fee factor (0-30%) applied to borrow interest, accrued to protocol treasury.",
	},
	ProtocolRevenue: {
		[METRIC.BORROW_INTEREST]: "Fee factor (0-30%) applied to borrow interest, accrued to protocol treasury.",
	},
	SupplySideRevenue: {
		[METRIC.BORROW_INTEREST]: "Remaining borrow interest distributed to liquidity providers.",
	},
};

const adapter: Adapter = {
	version: 2,
	adapter: {
		[CHAIN.ETHEREUM]: { fetch, start: "2024-09-03" },
	},
	methodology,
	breakdownMethodology,
};

export default adapter;
