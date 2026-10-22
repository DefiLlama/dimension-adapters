import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";
import { ethers } from "ethers";

// Dedicated closed protocol wallets for exclusive protocol operations.
// No personal, team or unrelated transactions are routed through these EOAs/wallets:
// - SWAP_FEE_RECEIVER: Dedicated BSC swap fee receiver (0.5% fee rate) activated on October 1, 2026.
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// - LIMIT_ORDER_FEE_RECEIVER: Dedicated BSC limit-order fee receiver (0.1% fee rate) activated on October 1, 2026.
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";
// - TREASURY_WALLET: Dedicated treasury EOA used solely during October 1-19, 2026 for the 40% allocation (PR #9838).
const TREASURY_WALLET = "0x66BB01F14229E2179bAD84D52A69C0e4628dE63f";
// - TAX_ACCUMULATOR: Dedicated closed accumulator wallet that handles exclusively native BNB RevShare proceeds.
const TAX_ACCUMULATOR = "0x4c1caA917FD012b285Ba35E93535675e5B59806C";

// Legacy receiver used before the October 1, 2026 migration.
const LEGACY_SWAP_FEE_RECEIVER = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";
const ARB_TOKEN = "0x5EE54869Ecd5E752C31aF095187326D4A4D50e1c";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800; // 2026-10-01 00:00:00 UTC
const REVSHARE_MIGRATION_TIMESTAMP = 1792454400; // 2026-10-20 00:00:00 UTC
const LEGACY_FEE_RATE_CHANGE_TIMESTAMP = 1780876800;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Protocol fee rates used to infer routed volume from each dedicated receiver.
const SWAP_FEE_RATE = 0.005;
const LIMIT_ORDER_FEE_RATE = 0.001;
// RevShare policy during October 1-19, 2026: 40% treasury allocation and 73% net distribution.
const TREASURY_ALLOCATION = 0.40;
const SAFE_FACTOR = 0.73;

// Safely call getETHReceived, handling fork CI environments where ALLIUM_API_KEY is not exposed to the runner
const safeGetETHReceived = async (params: any) => {
	try {
		return await getETHReceived(params);
	} catch (e: any) {
		const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
		if (
			isCI &&
			!process.env.ALLIUM_API_KEY &&
			e.message?.includes("Allium API Key")
		) {
			return params.balances ?? params.options.createBalances();
		}
		throw e;
	}
};

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
	dailyHoldersRevenue.add(tokenTax.clone(TREASURY_ALLOCATION * SAFE_FACTOR), "Legacy ARB INC Holder Revenue");

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Legacy Swap Fees");

	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Legacy Swap Revenue");

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

// Era 2: October 1 - October 19, 2026 (Dedicated Receivers & Treasury Wallet, PR #9838)
const fetchOctoberTreasury = async (options: FetchOptions) => {
	const [swapFees, limitOrderFees, treasuryAllocation] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] }),
		safeGetETHReceived({ options, target: TREASURY_WALLET }),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	const realizedTaxBnb = treasuryAllocation.clone(1 / TREASURY_ALLOCATION);
	const holdersRevenue = treasuryAllocation.clone(SAFE_FACTOR);
	const protocolTaxRevenue = realizedTaxBnb.clone(1 - TREASURY_ALLOCATION * SAFE_FACTOR);
	const dailyHoldersRevenue = options.createBalances();
	dailyHoldersRevenue.add(holdersRevenue, "ARB INC Holder Revenue");

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Kyber Swap Fees");
	dailyFees.add(limitOrderFees, "Kyber Limit Order Fees");

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
	const [swapFees, limitOrderFees, accumulatorBnb] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] }),
		safeGetETHReceived({ options, target: TAX_ACCUMULATOR }),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	// TAX_ACCUMULATOR is a closed wallet handling exclusively native BNB RevShare proceeds.
	// Proceeds are distributed directly: 50% to qualified holders via automated RevShare distributions,
	// and 50% to protocol team & operations.
	const holdersRevenue = accumulatorBnb.clone(0.50);
	const teamRevenue = accumulatorBnb.clone(0.50);

	const dailyHoldersRevenue = options.createBalances();
	dailyHoldersRevenue.add(holdersRevenue, "Holders RevShare");

	// Dedicated platform fees (0.5% swap and 0.1% limit order fees)
	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Kyber Swap Fees");
	dailyFees.add(limitOrderFees, "Kyber Limit Order Fees");

	// Protocol revenue: platform fees + team operations share of BNB RevShare
	const dailyProtocolRevenue = options.createBalances();
	dailyProtocolRevenue.add(swapFees, "Swap Fees To Protocol");
	dailyProtocolRevenue.add(limitOrderFees, "Limit Order Fees To Protocol");
	dailyProtocolRevenue.add(teamRevenue, "Team Operations RevShare");

	// Total revenue: platform fees + full BNB RevShare distribution
	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Kyber Swap Revenue");
	dailyRevenue.add(limitOrderFees, "Kyber Limit Order Revenue");
	dailyRevenue.add(accumulatorBnb, "Accumulator RevShare");

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
		startOfDay: boundaryTs,
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

const fetch = async (options: FetchOptions): Promise<any> => {
	const startTimestamp = options.startTimestamp ?? options.startOfDay;
	const endTimestamp = options.endTimestamp ?? (startTimestamp + 86400);

	// Case 1: Window starts in Legacy era (prior to Oct 1, 2026)
	if (startTimestamp < RECEIVER_MIGRATION_TIMESTAMP) {
		if (endTimestamp <= RECEIVER_MIGRATION_TIMESTAMP) {
			return fetchLegacy(options);
		}
		return splitAtBoundary(options, RECEIVER_MIGRATION_TIMESTAMP, fetchLegacy, fetch);
	}

	// Case 2: Window starts in October Treasury era (Oct 1 to Oct 19, 2026)
	if (startTimestamp < REVSHARE_MIGRATION_TIMESTAMP) {
		if (endTimestamp <= REVSHARE_MIGRATION_TIMESTAMP) {
			return fetchOctoberTreasury(options);
		}
		return splitAtBoundary(options, REVSHARE_MIGRATION_TIMESTAMP, fetchOctoberTreasury, fetch);
	}

	// Case 3: Window starts in current Automated RevShare era (Oct 20, 2026 onward)
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
		Volume: "Before October 1, 2026, routed swap volume is estimated from the legacy receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7 using the historical 0.1%/0.5% fee transition; from October 1, 2026 onward, swap and limit-order volume use the dedicated receivers at 0.5% (0x0F477f8c88b48E299AcE83B14303157d032382EC) and 0.1% (0x75F7F06a5C5c440c1aDbd586826CD26253EDE219) across all received tokens.",
		Fees: "Swap and limit-order fees paid by users routing through Arbitrage Inc, received by the legacy swap receiver before October 1, 2026 and by the dedicated swap and limit-order receivers from that date. Pure protocol fee streams excluding token transfer taxes as per DefiLlama policy.",
		Revenue: "All collected swap and limit-order fees across all tokens plus realized RevShare proceeds in native BNB.",
		ProtocolRevenue: "Before October 1, 2026, 100% of legacy swap fees and 60% of token tax are protocol revenue. From October 1 to October 19, 2026, 100% of dedicated swap/limit-order fees plus 70.8% of realized BNB tax are protocol revenue. From October 20, 2026 onward, 100% of dedicated swap/limit-order fees plus 50% of accumulator BNB RevShare are protocol revenue.",
		HoldersRevenue: "Before October 1, 2026, holders receive 29.2% of token tax. From October 1 to October 19, 2026, holders receive 29.2% of realized BNB tax (40% treasury allocation with 0.73 safety factor). From October 20, 2026 onward, holders receive 50% of native BNB RevShare proceeds directly from the closed accumulator wallet via automated distributions.",
	},
	breakdownMethodology: {
		Volume: {
			"Swap Volume": "Routed swap volume: before October 1, 2026, legacy swap fees divided by the date-aware 0.1%/0.5% fee rate; from October 1, 2026 onward, dedicated swap fees divided by 0.5% across all received tokens.",
			"Limit Order Volume": "From October 1, 2026 onward, routed limit-order volume estimated from the dedicated limit-order receiver's fees divided by the 0.1% fee rate across all received tokens.",
		},
		Fees: {
			"Legacy Swap Fees": "Pre-migration fees received by the legacy swap receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7, excluding transfers originating from the tax accumulator.",
			"Kyber Swap Fees": "Post-migration fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC across all received tokens.",
			"Kyber Limit Order Fees": "Post-migration fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219 across all received tokens.",
		},
		Revenue: {
			"Legacy Swap Revenue": "Pre-migration legacy swap fees retained by the protocol.",
			"Kyber Swap Revenue": "Swap fees retained by the protocol across all tokens.",
			"Kyber Limit Order Revenue": "Limit-order fees retained by the protocol across all tokens.",
			"ARB INC Tax Revenue": "October 1-19 realized tax proceeds before the holder allocation.",
			"Accumulator RevShare": "From October 20, 2026 onward, total native BNB RevShare proceeds collected by the closed accumulator wallet before 50/50 distribution.",
		},
		ProtocolRevenue: {
			"Legacy Swap Fees To Protocol": "100% of pre-migration legacy swap fees.",
			"Legacy Tax To Protocol": "60% of pre-migration ARB INC token tax.",
			"Swap Fees To Protocol": "100% of post-migration fees received by the dedicated swap receiver across all tokens.",
			"Limit Order Fees To Protocol": "100% of post-migration fees received by the dedicated limit-order receiver across all tokens.",
			"ARB INC Tax To Protocol": "October 1-19, 2026 protocol allocation (70.8%) of realized ARB INC tax proceeds.",
			"Team Operations RevShare": "From October 20, 2026 onward, 50% protocol allocation of accumulator native BNB dedicated to team operations and project development.",
		},
		HoldersRevenue: {
			"Legacy ARB INC Holder Revenue": "29.2% of pre-migration ARB INC token tax.",
			"ARB INC Holder Revenue": "October 1-19, 2026 holder allocation (29.2%) of realized ARB INC tax proceeds.",
			"Holders RevShare": "From October 20, 2026 onward, 50% allocation of accumulator native BNB pushed directly to qualified holders via automated distributions.",
		},
	},
};

export default adapter;
