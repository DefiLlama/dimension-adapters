import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import { ethers } from "ethers";


// Dedicated BSC swap fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol swap fees (0.5% fee rate).
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// Dedicated BSC limit-order fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol limit-order fees (0.1% fee rate).
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";

// Legacy receiver used before the October 1, 2026 migration.
const LEGACY_SWAP_FEE_RECEIVER = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";
// Token-tax accumulator; its transfers into the legacy receiver are tax proceeds, not swap fees.
const TAX_ACCUMULATOR = "0x4c1caA917FD012b285Ba35E93535675e5B59806C";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800; // 2026-10-01 00:00:00 UTC
const LEGACY_FEE_RATE_CHANGE_TIMESTAMP = 1780876800;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Protocol fee rates used to infer routed volume from each dedicated receiver.
const SWAP_FEE_RATE = 0.005;
const LIMIT_ORDER_FEE_RATE = 0.001;

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

const fetchLegacy = async (options: FetchOptions) => {
	const timestamp = options.startTimestamp ?? options.startOfDay;
	const feeRate = timestamp < LEGACY_FEE_RATE_CHANGE_TIMESTAMP ? 0.001 : SWAP_FEE_RATE;
	const swapFees = await getLegacySwapFees(options);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / feeRate));

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

const fetchCurrent = async (options: FetchOptions) => {
	const [swapFees, limitOrderFees] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] }),
	]);

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE));
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE));

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

const fetch = async (options: FetchOptions) => {
	const timestamp = options.startTimestamp ?? options.startOfDay;
	return timestamp < RECEIVER_MIGRATION_TIMESTAMP ? fetchLegacy(options) : fetchCurrent(options);
}

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	chains: [CHAIN.BSC],
	start: "2026-03-23",
	methodology: {
		Volume: "Before October 1, 2026, routed swap volume is estimated from the legacy receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7 using the historical 0.1%/0.5% fee transition; from October 1, 2026 onward, swap and limit-order volume use the dedicated receivers at 0.5% (0x0F477f8c88b48E299AcE83B14303157d032382EC) and 0.1% (0x75F7F06a5C5c440c1aDbd586826CD26253EDE219). The dedicated receivers are used only for their stated protocol fee streams.",
		Fees: "Swap and limit-order fees paid by users routing through Arbitrage Inc, received by the legacy swap receiver before October 1, 2026 and by the dedicated swap and limit-order receivers from that date. Excludes the 4% ARB INC token transfer tax.",
		Revenue: "All swap and limit-order fees paid by users, kept by the protocol. Excludes the 4% ARB INC token transfer tax.",
		ProtocolRevenue: "All swap and limit-order fees paid by users, kept by the protocol fee receivers. Excludes the 4% ARB INC token transfer tax.",
	},
	breakdownMethodology: {
		Fees: {
			"Legacy Swap Fees": "Pre-migration fees received by the legacy swap receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7, excluding token-tax proceeds forwarded from the tax accumulator 0x4c1caA917FD012b285Ba35E93535675e5B59806C.",
			"Kyber Swap Fees": "Post-migration fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC.",
			"Kyber Limit Order Fees": "Post-migration fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219.",
		},
		Revenue: {
			"Legacy Swap Revenue": "Pre-migration legacy swap fees retained by the protocol.",
			"Kyber Swap Revenue": "Post-migration swap fees retained by the protocol.",
			"Kyber Limit Order Revenue": "Post-migration limit-order fees retained by the protocol.",
		},
		ProtocolRevenue: {
			"Legacy Swap Fees To Protocol": "100% of pre-migration legacy swap fees.",
			"Swap Fees To Protocol": "100% of post-migration fees received by the dedicated swap receiver.",
			"Limit Order Fees To Protocol": "100% of post-migration fees received by the dedicated limit-order receiver.",
		},
	},
};

export default adapter;
