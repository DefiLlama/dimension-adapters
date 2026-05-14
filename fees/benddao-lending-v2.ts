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
  const { createBalances, getLogs, api, startTimestamp, endTimestamp } = options;
  const period = endTimestamp - startTimestamp;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [pools, borrowUpdates, redeemLogs] = await Promise.all([
    api.call({ target: POOL_LENS, abi: abis.getPoolList }) as Promise<string[]>,
    getLogs({ target: POOL_MANAGER, eventAbi: events.AssetInterestBorrowDataUpdated }),
    getLogs({ target: POOL_MANAGER, eventAbi: events.IsolateRedeem }),
  ]);

  const lastRateByKey: Record<string, bigint> = {};
  borrowUpdates.forEach((log: any) => {
    const key = `${log.poolId}-${log.asset.toLowerCase()}-${log.groupId}`;
    lastRateByKey[key] = log.borrowRate;
  });

  const assetLists = await api.multiCall({
    target: POOL_LENS,
    abi: abis.getPoolAssetList,
    calls: pools.map(p => ({ params: [p] })),
  });

  // Flatten to ERC20-only (poolId, asset) pairs (type 1 = ERC20, type 2 = ERC721 collateral)
  const assets: { poolId: string; asset: string }[] = [];
  for (let i = 0; i < pools.length; i++) {
    const al = assetLists[i];
    const addrs: string[] = al.assets || al[0];
    const types: string[] = al.types || al[1];
    for (let j = 0; j < addrs.length; j++) {
      if (Number(types[j]) === 1) assets.push({ poolId: pools[i], asset: addrs[j] });
    }
  }
  const assetParams = assets.map(a => ({ params: [a.poolId, a.asset] }));

  const [feeResults, groupLists] = await Promise.all([
    api.multiCall({ target: POOL_LENS, abi: abis.getAssetFeeData, calls: assetParams }),
    api.multiCall({ target: POOL_LENS, abi: abis.getAssetGroupList, calls: assetParams }),
  ]);

  // Flatten to (poolId, asset, group) tuples, skipping group 0 and assets with no fee factor
  const groupCalls: { params: [string, string, number]; assetIdx: number }[] = [];
  for (let i = 0; i < assets.length; i++) {
    if (Number(feeResults[i].feeFactor) === 0) continue;
    for (const g of groupLists[i]) {
      if (Number(g) === 0) continue;
      groupCalls.push({ params: [assets[i].poolId, assets[i].asset, Number(g)], assetIdx: i });
    }
  }

  const groupData = await api.multiCall({
    target: POOL_LENS,
    abi: abis.getAssetGroupData,
    calls: groupCalls.map(c => ({ params: c.params })),
  });

  for (let i = 0; i < groupData.length; i++) {
    const gd = groupData[i];
    const groupDebt = BigInt(gd.totalCrossBorrow) + BigInt(gd.totalIsolateBorrow);
    if (groupDebt === 0n) continue;

    const [poolId, asset, group] = groupCalls[i].params;
    const key = `${poolId}-${asset.toLowerCase()}-${group}`;
    const rate = lastRateByKey[key] ?? BigInt(gd.borrowRate);

    const annualRate = Number(rate) / 1e27;
    const dailyInterest = BigInt(Math.floor(Number(groupDebt) * annualRate * period / SECONDS_PER_YEAR));
    if (dailyInterest === 0n) continue;

    const feeFactor = Number(feeResults[groupCalls[i].assetIdx].feeFactor) / 10000;
    const protocolShare = BigInt(Math.floor(Number(dailyInterest) * feeFactor));
    dailyFees.add(asset, dailyInterest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(asset, protocolShare, "Borrow Interest To veBEND Holders");
    dailyHoldersRevenue.add(asset, protocolShare, "Borrow Interest To veBEND Holders");
    dailySupplySideRevenue.add(asset, BigInt(Math.floor(Number(dailyInterest) * (1 - feeFactor))), "Borrow Interest To Lenders");
  }

  // Bid fines from isolate redeem auctions are paid to the first bidder, not the protocol
  redeemLogs.forEach((log: any) => {
    const bidFines: bigint[] = log.bidFines;
    bidFines.forEach((fine: bigint) => {
      dailyFees.add(log.debtAsset, fine, METRIC.LIQUIDATION_FEES);
      dailySupplySideRevenue.add(log.debtAsset, fine, METRIC.LIQUIDATION_FEES);
    });
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Interest paid by borrowers across all pools and borrow groups (cross-margin + isolated) + isolate redeem bid fines paid to auction bidders.",
  Revenue: "Protocol's share of borrow interest (set by each asset's on-chain fee factor), 100% claimable by veBEND holders proportionally.",
  HoldersRevenue: "Protocol's share of borrow interest, 100% distributed to veBEND holders proportionally.",
  SupplySideRevenue: "Remaining borrow interest distributed to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest accrued daily on outstanding loans across all pools and groups.",
    [METRIC.LIQUIDATION_FEES]: "Bid fines from IsolateRedeem events, paid by borrowers who redeem during NFT auction, goes to first bidder.",
  },
  Revenue: {
    "Borrow Interest To veBEND Holders": "The protocol's share of borrow interest (set by each asset's on-chain fee factor), distributed to veBEND holders.",
  },
  HoldersRevenue: {
    "Borrow Interest To veBEND Holders": "The protocol's share of borrow interest (set by each asset's on-chain fee factor), distributed to veBEND holders.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Lenders": "The portion of borrow interest distributed to liquidity providers.",
    [METRIC.LIQUIDATION_FEES]: "Bid fines from IsolateRedeem events paid to the first bidder (not the protocol).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2024-09-03" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
