import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";
import { ethers } from "ethers";

// Protocol fee receivers:
// - SWAP_FEE_RECEIVER: Dedicated BSC swap fee receiver (0.5% fee rate) activated on October 1, 2026.
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// - LIMIT_ORDER_FEE_RECEIVER: Dedicated BSC limit-order fee receiver (0.1% fee rate) activated on October 1, 2026.
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";

// Legacy receiver used before the October 1, 2026 migration.
const LEGACY_SWAP_FEE_RECEIVER = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";
// Tax accumulator address used strictly to filter out transfer tax forwards into legacy swap fees.
const TAX_ACCUMULATOR = "0x4c1caA917FD012b285Ba35E93535675e5B59806C";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800; // 2026-10-01 00:00:00 UTC
const LEGACY_FEE_RATE_CHANGE_TIMESTAMP = 1780876800;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Protocol fee rates used to infer routed volume from each dedicated receiver.
const SWAP_FEE_RATE = 0.005;
const LIMIT_ORDER_FEE_RATE = 0.001;

// Safely call getETHReceived, handling local or fork environments where ALLIUM_API_KEY is not exposed
const safeGetETHReceived = async (params: any) => {
	try {
		return await getETHReceived(params);
	} catch (e: any) {
		if (
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

// Era 1: Pre-October 1, 2026 (Legacy Swap Receiver)
const fetchLegacy = async (options: FetchOptions) => {
	const timestamp = options.startTimestamp ?? options.startOfDay;
	const feeRate = timestamp < LEGACY_FEE_RATE_CHANGE_TIMESTAMP ? 0.001 : SWAP_FEE_RATE;
	const swapFees = await getLegacySwapFees(options);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / feeRate), "Legacy Swap Volume");

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Legacy Swap Fees");

	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Legacy Swap Revenue");

	const dailyProtocolRevenue = options.createBalances();
	dailyProtocolRevenue.add(swapFees, "Legacy Swap Fees To Protocol");

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
	};
};

const getSwapFees = async (options: FetchOptions) => {
	const balances = await addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] });
	await safeGetETHReceived({ options, target: SWAP_FEE_RECEIVER, balances });
	return balances;
};

const getLimitOrderFees = async (options: FetchOptions) => {
	const balances = await addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] });
	await safeGetETHReceived({ options, target: LIMIT_ORDER_FEE_RECEIVER, balances });
	return balances;
};

// Era 2: October 1, 2026 onward (Dedicated Swap & Limit Order Receivers)
const fetchCurrent = async (options: FetchOptions) => {
	const [swapFees, limitOrderFees] = await Promise.all([
		getSwapFees(options),
		getLimitOrderFees(options),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Kyber Swap Fees");
	dailyFees.add(limitOrderFees, "Kyber Limit Order Fees");

	const dailyRevenue = options.createBalances();
	dailyRevenue.add(swapFees, "Kyber Swap Revenue");
	dailyRevenue.add(limitOrderFees, "Kyber Limit Order Revenue");

	const dailyProtocolRevenue = options.createBalances();
	dailyProtocolRevenue.add(swapFees, "Swap Fees To Protocol");
	dailyProtocolRevenue.add(limitOrderFees, "Limit Order Fees To Protocol");

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
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
	};
};

const fetch = async (options: FetchOptions): Promise<any> => {
	const startTimestamp = options.startTimestamp ?? options.startOfDay;
	const endTimestamp = options.endTimestamp ?? (startTimestamp + 86400);

	if (startTimestamp < RECEIVER_MIGRATION_TIMESTAMP) {
		if (endTimestamp <= RECEIVER_MIGRATION_TIMESTAMP) {
			return fetchLegacy(options);
		}
		return splitAtBoundary(options, RECEIVER_MIGRATION_TIMESTAMP, fetchLegacy, fetchCurrent);
	}

	return fetchCurrent(options);
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	chains: [CHAIN.BSC],
	start: "2026-03-23",
	dependencies: [Dependencies.ALLIUM],
	methodology: {
		Volume: "Before October 1, 2026, routed swap volume is estimated from the legacy receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7 using the historical 0.1%/0.5% fee transition; from October 1, 2026 onward, swap and limit-order volume use the dedicated receivers at 0.5% (0x0F477f8c88b48E299AcE83B14303157d032382EC) and 0.1% (0x75F7F06a5C5c440c1aDbd586826CD26253EDE219) across all received BEP-20 tokens and native BNB.",
		Fees: "Swap and limit-order fees paid by users routing through Arbitrage Inc, received by the legacy swap receiver before October 1, 2026 and by the dedicated swap and limit-order receivers from that date. Pure protocol fee streams excluding token transfer taxes as per DefiLlama policy.",
		Revenue: "All collected swap and limit-order fees across all tokens and native BNB retained by the protocol.",
		ProtocolRevenue: "100% of collected swap and limit-order fees retained by the protocol fee receivers.",
	},
	breakdownMethodology: {
		Volume: {
			"Swap Volume": "Routed swap volume from October 1, 2026 onward, calculated as dedicated swap receiver fees divided by the 0.5% fee rate across all received tokens and native BNB.",
			"Limit Order Volume": "Routed limit-order volume from October 1, 2026 onward, calculated as dedicated limit-order receiver fees divided by the 0.1% fee rate across all received tokens and native BNB.",
			"Legacy Swap Volume": "Routed swap volume before October 1, 2026, calculated from legacy swap fees divided by the date-aware 0.1%/0.5% fee rate.",
		},
		Fees: {
			"Legacy Swap Fees": "Pre-migration fees received by the legacy swap receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7, excluding transfers originating from the tax accumulator.",
			"Kyber Swap Fees": "Post-migration fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC across all received tokens and native BNB.",
			"Kyber Limit Order Fees": "Post-migration fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219 across all received tokens and native BNB.",
		},
		Revenue: {
			"Legacy Swap Revenue": "Pre-migration legacy swap fees retained by the protocol.",
			"Kyber Swap Revenue": "Post-migration swap fees retained by the protocol across all tokens and native BNB.",
			"Kyber Limit Order Revenue": "Post-migration limit-order fees retained by the protocol across all tokens and native BNB.",
		},
		ProtocolRevenue: {
			"Legacy Swap Fees To Protocol": "100% of pre-migration legacy swap fees.",
			"Swap Fees To Protocol": "100% of post-migration fees received by the dedicated swap receiver across all tokens and native BNB.",
			"Limit Order Fees To Protocol": "100% of post-migration fees received by the dedicated limit-order receiver across all tokens and native BNB.",
		},
	},
};

export default adapter;
