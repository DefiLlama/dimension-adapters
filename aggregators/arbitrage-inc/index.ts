import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";
import { ethers } from "ethers";

// Dedicated BSC swap fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol swap fees (0.5% fee rate).
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// Dedicated BSC limit-order fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol limit-order fees (0.1% fee rate).
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";
// Treasury wallet used during the October 1 - October 19, 2026 window for the 40% RevShare allocation.
// Decommissioned on October 20, 2026 in favor of direct automated RevShare push from the accumulator.
const TREASURY_WALLET = "0x66BB01F14229E2179bAD84D52A69C0e4628dE63f";

// Legacy receiver and tax accumulator used before the October 1, 2026 migration.
const LEGACY_SWAP_FEE_RECEIVER = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";
// Tax accumulator address that collects 100% of the 4% ARB INC token transfer tax on-chain.
const TAX_ACCUMULATOR = "0x4c1caA917FD012b285Ba35E93535675e5B59806C";
const ARB_TOKEN = "0x5EE54869Ecd5E752C31aF095187326D4A4D50e1c";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800; // 2026-10-01 00:00:00 UTC
const REVSHARE_MIGRATION_TIMESTAMP = 1792454400; // 2026-10-20 00:00:00 UTC
const LEGACY_FEE_RATE_CHANGE_TIMESTAMP = 1780876800;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Protocol fee rates used to infer routed volume from each dedicated receiver.
const SWAP_FEE_RATE = 0.005;
const LIMIT_ORDER_FEE_RATE = 0.001;
// RevShare policy during the October 1-19, 2026 window:
const TREASURY_ALLOCATION = 0.40;
const LEGACY_SAFE_FACTOR = 0.73;

const getLegacySwapFees = async (options: FetchOptions) => {
	const balances = options.createBalances();
	const logs = await options.getLogs({
		eventAbi: "event Transfer (address indexed from, address indexed to, uint256 value)",
		topics: [TRANSFER_TOPIC, null, ethers.zeroPadValue(LEGACY_SWAP_FEE_RECEIVER, 32)],
		noTarget: true,
		entireLog: true,
		parseLog: true,
	});

	logs.forEach((log: any) => {
		const from = String(log.args?.from ?? log.from ?? "").toLowerCase();
		if (from === TAX_ACCUMULATOR.toLowerCase()) return;
		const value = log.args?.value ?? log.value ?? log.data;
		if (!value || value === "0x") return;
		balances.add(log.address, value);
	});

	await getETHReceived({
		options,
		target: LEGACY_SWAP_FEE_RECEIVER,
		notFromSenders: [TAX_ACCUMULATOR],
		balances,
	});

	return balances;
};

// Era 1: Pre-October 1, 2026 (Legacy Swap Receiver & Token Tax Accumulator)
const fetchLegacy = async (options: FetchOptions) => {
	const timestamp = options.startTimestamp ?? options.startOfDay;
	const feeRate = timestamp < LEGACY_FEE_RATE_CHANGE_TIMESTAMP ? 0.001 : SWAP_FEE_RATE;
	const [swapFees, tokenTax] = await Promise.all([
		getLegacySwapFees(options),
		addTokensReceived({ options, target: TAX_ACCUMULATOR, tokens: [ARB_TOKEN] }),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / feeRate), "Swap Volume");

	const dailyHoldersRevenue = options.createBalances();
	dailyHoldersRevenue.add(tokenTax.clone(TREASURY_ALLOCATION * LEGACY_SAFE_FACTOR), "Legacy ARB INC Holder Revenue");

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Legacy Swap Fees");
	dailyFees.add(tokenTax, "Legacy Token Transfer Tax");

	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Legacy Swap Revenue");
	dailyRevenue.add(tokenTax, "Legacy Tax Revenue");

	const dailyProtocolRevenue = options.createBalances();
	dailyProtocolRevenue.add(swapFees, "Legacy Swap Fees To Protocol");
	dailyProtocolRevenue.add(tokenTax.clone(1 - TREASURY_ALLOCATION), "Legacy Tax To Protocol");

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
		dailyHoldersRevenue,
	};
};

// Era 2: October 1 - October 19, 2026 (Dedicated Receivers & Treasury Wallet)
const fetchOctoberTreasury = async (options: FetchOptions) => {
	const swapFees = options.createBalances();
	const limitOrderFees = options.createBalances();

	const [, , treasuryAllocation] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER], balances: swapFees }),
		getETHReceived({ options, target: SWAP_FEE_RECEIVER, balances: swapFees }),
		getETHReceived({ options, target: TREASURY_WALLET }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER], balances: limitOrderFees }),
		getETHReceived({ options, target: LIMIT_ORDER_FEE_RECEIVER, balances: limitOrderFees }),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	const realizedTaxBnb = treasuryAllocation.clone(1 / TREASURY_ALLOCATION);
	const holdersRevenue = treasuryAllocation.clone(LEGACY_SAFE_FACTOR);
	const protocolTaxRevenue = realizedTaxBnb.clone(1 - TREASURY_ALLOCATION * LEGACY_SAFE_FACTOR);
	const dailyHoldersRevenue = options.createBalances();
	dailyHoldersRevenue.add(holdersRevenue, "ARB INC Holder Revenue");

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Kyber Swap Fees");
	dailyFees.add(limitOrderFees, "Kyber Limit Order Fees");
	dailyFees.add(realizedTaxBnb, "ARB INC Tax Realized In BNB");

	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Kyber Swap Revenue");
	dailyRevenue.add(limitOrderFees, "Kyber Limit Order Revenue");
	dailyRevenue.add(realizedTaxBnb, "ARB INC Tax Revenue");

	const dailyProtocolRevenue = options.createBalances();
	dailyProtocolRevenue.add(swapFees, "Swap Fees To Protocol");
	dailyProtocolRevenue.add(limitOrderFees, "Limit Order Fees To Protocol");
	dailyProtocolRevenue.add(protocolTaxRevenue, "ARB INC Tax To Protocol");

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
		dailyHoldersRevenue,
	};
};

// Era 3: October 20, 2026 onward (Automated RevShare Direct Push: 50% Holders / 50% Team in native BNB, Safe Factor Eliminated)
const fetchRevShareDirect = async (options: FetchOptions) => {
	const swapFees = options.createBalances();
	const limitOrderFees = options.createBalances();

	const [, , treasuryAllocation] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER], balances: swapFees }),
		getETHReceived({ options, target: SWAP_FEE_RECEIVER, balances: swapFees }),
		getETHReceived({ options, target: TREASURY_WALLET }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER], balances: limitOrderFees }),
		getETHReceived({ options, target: LIMIT_ORDER_FEE_RECEIVER, balances: limitOrderFees }),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	// In the automated RevShare model, the 4% ARB INC token transfer tax proceeds in native BNB
	// are split 50% directly to qualified holders (>= 1M ARB) via RevShare and 50% to protocol operations.
	const realizedTaxBnb = treasuryAllocation.clone(1 / 0.50);
	const holdersRevenue = treasuryAllocation.clone(1.0);
	const protocolTaxRevenue = realizedTaxBnb.clone(0.50);

	const dailyHoldersRevenue = options.createBalances();
	dailyHoldersRevenue.add(holdersRevenue, "ARB INC Holder RevShare");

	// Gross Fees: Swap Fees + Limit Order Fees + 100% Tax Realized in BNB
	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Kyber Swap Fees");
	dailyFees.add(limitOrderFees, "Kyber Limit Order Fees");
	dailyFees.add(realizedTaxBnb, "ARB INC Tax Realized In BNB");

	// Gross Revenue: dailyFees = dailyRevenue (no supply-side costs)
	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Kyber Swap Revenue");
	dailyRevenue.add(limitOrderFees, "Kyber Limit Order Revenue");
	dailyRevenue.add(realizedTaxBnb, "ARB INC Tax Revenue");

	// Protocol Revenue: 100% Swap Fees + 100% Limit Order Fees + 50% Token Tax in BNB
	const dailyProtocolRevenue = options.createBalances();
	dailyProtocolRevenue.add(swapFees, "Swap Fees To Protocol");
	dailyProtocolRevenue.add(limitOrderFees, "Limit Order Fees To Protocol");
	dailyProtocolRevenue.add(protocolTaxRevenue, "ARB INC Tax To Protocol Operations");

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
		dailyHoldersRevenue,
	};
};

const splitAtBoundary = async (
	options: FetchOptions,
	boundaryTs: number,
	preFetch: (opts: FetchOptions) => Promise<any>,
	postFetch: (opts: FetchOptions) => Promise<any>,
) => {
	const boundaryBlock: number =
		typeof options.getBlock === "function"
			? await options.getBlock(boundaryTs, options.chain, {})
			: await options.getFromBlock();

	const preOptions: FetchOptions = {
		...options,
		endTimestamp: boundaryTs,
		toTimestamp: boundaryTs - 1,
		getToBlock: async () => boundaryBlock - 1,
		getLogs: (params: any) =>
			options.getLogs({
				...params,
				toBlock: params.toBlock ? Math.min(params.toBlock, boundaryBlock - 1) : boundaryBlock - 1,
			}),
	};

	const postOptions: FetchOptions = {
		...options,
		startTimestamp: boundaryTs,
		fromTimestamp: boundaryTs,
		getFromBlock: async () => boundaryBlock,
		getLogs: (params: any) =>
			options.getLogs({
				...params,
				fromBlock: params.fromBlock ? Math.max(params.fromBlock, boundaryBlock) : boundaryBlock,
			}),
	};

	const [resPre, resPost] = await Promise.all([preFetch(preOptions), postFetch(postOptions)]);

	const merge = (key: string) => {
		const balances = options.createBalances();
		if (resPre && resPre[key]) balances.addBalances(resPre[key]);
		if (resPost && resPost[key]) balances.addBalances(resPost[key]);
		return balances;
	};

	return {
		dailyVolume: merge("dailyVolume"),
		dailyFees: merge("dailyFees"),
		dailyRevenue: merge("dailyRevenue"),
		dailyProtocolRevenue: merge("dailyProtocolRevenue"),
		dailyHoldersRevenue: merge("dailyHoldersRevenue"),
	};
};

const fetch = async (options: FetchOptions) => {
	const startTimestamp = options.startTimestamp ?? options.startOfDay;
	const endTimestamp = options.endTimestamp ?? (startTimestamp + 86400);

	// Case 1: Entirely within Legacy era (prior to Oct 1, 2026)
	if (endTimestamp <= RECEIVER_MIGRATION_TIMESTAMP) {
		return fetchLegacy(options);
	}

	// Case 2: Crossing the Oct 1, 2026 receiver migration boundary
	if (startTimestamp < RECEIVER_MIGRATION_TIMESTAMP && endTimestamp > RECEIVER_MIGRATION_TIMESTAMP) {
		return splitAtBoundary(options, RECEIVER_MIGRATION_TIMESTAMP, fetchLegacy, fetchOctoberTreasury);
	}

	// Case 3: Entirely within October Treasury era (Oct 1 to Oct 19, 2026)
	if (endTimestamp <= REVSHARE_MIGRATION_TIMESTAMP) {
		return fetchOctoberTreasury(options);
	}

	// Case 4: Crossing the Oct 20, 2026 RevShare direct push boundary
	if (startTimestamp < REVSHARE_MIGRATION_TIMESTAMP && endTimestamp > REVSHARE_MIGRATION_TIMESTAMP) {
		return splitAtBoundary(options, REVSHARE_MIGRATION_TIMESTAMP, fetchOctoberTreasury, fetchRevShareDirect);
	}

	// Case 5: Entirely within current Automated RevShare era (Oct 20, 2026 onward)
	return fetchRevShareDirect(options);
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	chains: [CHAIN.BSC],
	start: "2026-03-23",
	dependencies: [Dependencies.ALLIUM],
	methodology: {
		Volume: "Before October 1, 2026, routed swap volume is estimated from the legacy receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7 using the historical 0.1%/0.5% fee transition; from October 1, 2026 onward, swap and limit-order volume use the dedicated receivers at 0.5% (0x0F477f8c88b48E299AcE83B14303157d032382EC) and 0.1% (0x75F7F06a5C5c440c1aDbd586826CD26253EDE219), collecting both ERC20 tokens and native BNB.",
		Fees: "Before October 1, 2026, fees include the legacy swap receiver and ARB INC token transfer tax. From October 1 to October 19, 2026, fees include the dedicated swap receiver, dedicated limit-order receiver, and BNB tax proceeds from the dedicated treasury. From October 20, 2026 onward, fees include the dedicated swap receiver, dedicated limit-order receiver, and native BNB tax proceeds realized from the 4% ARB INC token transfer tax.",
		Revenue: "All collected Kyber swap/limit-order fees across all tokens and realized ARB INC token transfer tax proceeds in native BNB. No supply-side costs are reported, so dailyRevenue equals dailyFees.",
		ProtocolRevenue: "Before October 1, 2026, 100% of legacy swap fees and 60% of token tax are protocol revenue. From October 1 to October 19, 2026, 100% of dedicated swap/limit-order fees plus 70.8% of realized BNB tax are protocol revenue. From October 20, 2026 onward, 100% of dedicated swap/limit-order fees plus 50% of realized BNB tax are protocol revenue.",
		HoldersRevenue: "Before October 1, 2026, holders receive 29.2% of token tax. From October 1 to October 19, 2026, holders receive 29.2% of realized BNB tax (40% treasury allocation with 0.73 safety factor). From October 20, 2026 onward, holders receive 50% of realized ARB INC tax proceeds directly in native BNB via automated RevShare distributions (safe factor eliminated).",
	},
	breakdownMethodology: {
		Volume: {
			"Swap Volume": "Routed swap volume: before October 1, 2026, legacy swap fees divided by the date-aware 0.1%/0.5% fee rate; from October 1, 2026 onward, dedicated swap fees divided by 0.5% across all ERC20 tokens and native BNB.",
			"Limit Order Volume": "From October 1, 2026 onward, routed limit-order volume estimated from the dedicated limit-order receiver's fees divided by the 0.1% fee rate across all ERC20 tokens and native BNB.",
		},
		Fees: {
			"Legacy Swap Fees": "Pre-migration fees received by the legacy swap receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7, excluding transfers originating from the tax accumulator.",
			"Legacy Token Transfer Tax": "Pre-migration ARB INC token tax received by the tax accumulator 0x4c1caA917FD012b285Ba35E93535675e5B59806C.",
			"Kyber Swap Fees": "Post-migration fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC across all ERC20 tokens and native BNB.",
			"Kyber Limit Order Fees": "Post-migration fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219 across all ERC20 tokens and native BNB.",
			"ARB INC Tax Realized In BNB": "Native BNB proceeds from the 4% ARB INC token transfer tax grossed up to 100% of realized tax (40% treasury allocation in October 1-19, 50% allocation from October 20 onward).",
		},
		Revenue: {
			"Legacy Swap Revenue": "Pre-migration legacy swap fees retained by the protocol.",
			"Legacy Tax Revenue": "Pre-migration ARB INC token tax before the holder allocation.",
			"Kyber Swap Revenue": "Swap fees retained by the protocol across all tokens.",
			"Kyber Limit Order Revenue": "Limit-order fees retained by the protocol across all tokens.",
			"ARB INC Tax Revenue": "Post-migration realized ARB INC tax proceeds in native BNB before the holder allocation.",
		},
		ProtocolRevenue: {
			"Legacy Swap Fees To Protocol": "100% of pre-migration legacy swap fees.",
			"Legacy Tax To Protocol": "60% of pre-migration ARB INC token tax.",
			"Swap Fees To Protocol": "100% of post-migration fees received by the dedicated swap receiver across all tokens.",
			"Limit Order Fees To Protocol": "100% of post-migration fees received by the dedicated limit-order receiver across all tokens.",
			"ARB INC Tax To Protocol": "October 1-19, 2026 protocol allocation (70.8%) of realized ARB INC tax proceeds.",
			"ARB INC Tax To Protocol Operations": "From October 20, 2026 onward, 50% protocol allocation of realized ARB INC tax proceeds in native BNB dedicated to protocol operations and core development.",
		},
		HoldersRevenue: {
			"Legacy ARB INC Holder Revenue": "29.2% of pre-migration ARB INC token tax.",
			"ARB INC Holder Revenue": "October 1-19, 2026 holder allocation (29.2%) of realized ARB INC tax proceeds.",
			"ARB INC Holder RevShare": "From October 20, 2026 onward, 50% allocation of realized ARB INC tax proceeds pushed directly in native BNB to qualified holders (>= 1M ARB) via automated RevShare distributions.",
		},
	},
};

export default adapter;
