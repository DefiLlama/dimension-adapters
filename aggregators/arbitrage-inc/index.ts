import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";

// Protocol fee receivers on BSC:
// - SWAP_FEE_RECEIVER: Dedicated BSC swap fee receiver (0.5% fee rate)
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// - LIMIT_ORDER_FEE_RECEIVER: Dedicated BSC limit-order fee receiver (0.1% fee rate)
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";

// Legacy protocol fee receiver used before the October 1, 2026 migration
const LEGACY_RECEIVER = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";

// Legacy tax accumulator address used strictly to exclude transfer tax forwards from legacy swap fees.
const TAX_ACCUMULATOR = "0x4c1caA917FD012b285Ba35E93535675e5B59806C";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800; // 2026-10-01 00:00:00 UTC
const LEGACY_FEE_RATE_CHANGE_TIMESTAMP = 1780876800; // 2026-06-08 00:00:00 UTC

const SWAP_FEE_RATE = 0.005; // 0.5%
const LIMIT_ORDER_FEE_RATE = 0.001; // 0.1%
// Historical protocol fee rate before June 8, 2026 (0.1%), matching initial protocol launch and v1 adapter parameters
const LEGACY_FEE_RATE = 0.001; // 0.1%

const safeAddTokensReceived = async (params: any) => {
	return await addTokensReceived(params);
};

const safeGetETHReceived = async (params: {
	options: FetchOptions;
	target?: string;
	targets?: string[];
	balances?: any;
	notFromSenders?: string[];
}) => {
	return await getETHReceived(params);
};

const fetch = async (options: FetchOptions) => {
	const timestamp = options.endTimestamp ?? (options.startTimestamp + 86400);

	// Pre-migration: legacy receiver with historical fee-rate change (0.1% before June 8, 2026, 0.5% thereafter)
	if (timestamp <= RECEIVER_MIGRATION_TIMESTAMP) {
		const dailyFees = await safeAddTokensReceived({
			options,
			targets: [LEGACY_RECEIVER],
			logFilter: (log: any) => {
				const from = String(log.from ?? log.fromAddress ?? log.from_address ?? "").toLowerCase();
				return from !== TAX_ACCUMULATOR.toLowerCase();
			},
		});
		await safeGetETHReceived({ options, target: LEGACY_RECEIVER, balances: dailyFees, notFromSenders: [TAX_ACCUMULATOR] });
		const feeRate = options.startTimestamp < LEGACY_FEE_RATE_CHANGE_TIMESTAMP ? LEGACY_FEE_RATE : SWAP_FEE_RATE;
		const dailyVolume = dailyFees.clone(1 / feeRate);

		return {
			dailyFees,
			dailyRevenue: dailyFees,
			dailyProtocolRevenue: dailyFees,
			dailyVolume,
		};
	}

	// Current model (Oct 1, 2026 onward):
	// 1. Swap fees (0.5%) across BEP-20 tokens and native BNB
	const swapFees = await safeAddTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] });
	await safeGetETHReceived({ options, target: SWAP_FEE_RECEIVER, balances: swapFees });

	// 2. Limit order fees (0.1%) across BEP-20 tokens and native BNB
	const limitOrderFees = await safeAddTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] });
	await safeGetETHReceived({ options, target: LIMIT_ORDER_FEE_RECEIVER, balances: limitOrderFees });

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Kyber Swap Fees");
	dailyFees.add(limitOrderFees, "Kyber Limit Order Fees");

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	return {
		dailyFees,
		dailyRevenue: dailyFees,
		dailyProtocolRevenue: dailyFees,
		dailyVolume,
	};
};

const methodology = {
	Volume:
		"Trading volume inferred from collected protocol fees: DEX swap fees divided by 0.5% (200x) and limit order fees divided by 0.1% (1000x). Pre-October 1, 2026 volume is inferred from the legacy receiver at 0.1% before June 8, 2026 and 0.5% thereafter.",
	Fees:
		"Protocol routing fees collected from trades executed via Arbitrage Inc on BSC: 0.5% on DEX swaps to 0x0F477f8c88b48E299AcE83B14303157d032382EC and 0.1% on limit orders to 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219 across BEP-20 tokens and native BNB.",
	Revenue:
		"100% of collected protocol fees are retained by the protocol.",
	ProtocolRevenue:
		"100% of collected platform fees are protocol revenue.",
};

const breakdownMethodology = {
	Volume: {
		"Swap Volume": "Volume routed through DEX swaps (fees / 0.005).",
		"Limit Order Volume": "Volume routed through limit orders (fees / 0.001).",
	},
	Fees: {
		"Kyber Swap Fees": "0.5% protocol routing fee collected on DEX swaps across tokens and native BNB.",
		"Kyber Limit Order Fees": "0.1% protocol fee collected on executed limit orders across tokens and native BNB.",
	},
	Revenue: {
		"Kyber Swap Fees": "0.5% protocol routing fee collected on DEX swaps.",
		"Kyber Limit Order Fees": "0.1% protocol fee collected on executed limit orders.",
	},
	ProtocolRevenue: {
		"Kyber Swap Fees": "0.5% protocol routing fee collected on DEX swaps.",
		"Kyber Limit Order Fees": "0.1% protocol fee collected on executed limit orders.",
	},
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	chains: [CHAIN.BSC],
	fetch,
	start: "2026-03-23",
	dependencies: [Dependencies.ALLIUM],
	methodology,
	breakdownMethodology,
};

export default adapter;
