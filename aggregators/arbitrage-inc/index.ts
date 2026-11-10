import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Protocol fee receivers on BSC:
// - SWAP_FEE_RECEIVER: Dedicated BSC swap fee receiver (0.5% fee rate)
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// - LIMIT_ORDER_FEE_RECEIVER: Dedicated BSC limit-order fee receiver (0.1% fee rate)
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";

// Developer commission wallets (50% / 50% allocation of aggregator developer fees):
// - Developer 1 (50%): 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7 (legacy swap fee receiver pre-Oct 1, 2026)
const DEV_WALLET_1 = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";
// - Developer 2 (50%): 0x3B523ec5AC7f37A151142b756040301729061348
const DEV_WALLET_2 = "0x3B523ec5AC7f37A151142b756040301729061348";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800; // 2026-10-01 00:00:00 UTC

const SWAP_FEE_RATE = 0.005; // 0.5%
const LIMIT_ORDER_FEE_RATE = 0.001; // 0.1%
const LEGACY_FEE_RATE = 0.001; // 0.1%

const fetch = async (options: FetchOptions) => {
	const timestamp = options.endTimestamp ?? (options.startTimestamp + 86400);

	// Pre-migration (before Oct 1, 2026): Legacy single receiver at 0.1% fee rate
	if (timestamp <= RECEIVER_MIGRATION_TIMESTAMP) {
		const dailyFees = await addTokensReceived({
			options,
			targets: [DEV_WALLET_1],
		});
		const dailyVolume = dailyFees.clone(1 / LEGACY_FEE_RATE);

		return {
			dailyFees,
			dailyRevenue: dailyFees,
			dailyProtocolRevenue: dailyFees,
			dailyVolume,
		};
	}

	// Current model (Oct 1, 2026 onward): Dedicated Swap (0.5%) & Limit Order (0.1%) receivers
	const [swapFees, limitOrderFees] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] }),
	]);

	const dailyFees = options.createBalances();
	dailyFees.add(swapFees, "Swap Fees");
	dailyFees.add(limitOrderFees, "Limit Order Fees");

	const dailyVolume = options.createBalances();
	dailyVolume.add(swapFees.clone(1 / SWAP_FEE_RATE), "Swap Volume");
	dailyVolume.add(limitOrderFees.clone(1 / LIMIT_ORDER_FEE_RATE), "Limit Order Volume");

	// 100% of fees go to the protocol/developer wallets (split 50% DEV_WALLET_1, 50% DEV_WALLET_2)
	// No holders revenue is distributed at the moment.
	return {
		dailyFees,
		dailyRevenue: dailyFees,
		dailyProtocolRevenue: dailyFees,
		dailyVolume,
	};
};

const methodology = {
	Volume:
		"Routed trading volume inferred from collected protocol fees: swap fees divided by 0.5% (200x) and limit order fees divided by 0.1% (1000x). Pre-October 1, 2026 volume is inferred from the legacy receiver at 0.1%.",
	Fees:
		"Protocol routing fees collected from trades executed via Arbitrage Inc on BSC: 0.5% on DEX swaps to 0x0F477f8c88b48E299AcE83B14303157d032382EC and 0.1% on limit orders to 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219, allocated to developer wallets (50% Developer 1 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7, 50% Developer 2 0x3B523ec5AC7f37A151142b756040301729061348).",
	Revenue:
		"100% of collected protocol fees from DEX swaps and limit orders are retained by the protocol developer wallets.",
	ProtocolRevenue:
		"100% of collected trading fees are protocol revenue.",
};

const breakdownMethodology = {
	Volume: {
		"Swap Volume": "Volume routed through DEX swaps (fees / 0.005).",
		"Limit Order Volume": "Volume routed through limit orders (fees / 0.001).",
	},
	Fees: {
		"Swap Fees": "0.5% protocol routing fee collected on DEX swaps.",
		"Limit Order Fees": "0.1% protocol fee collected on executed limit orders.",
	},
	Revenue: {
		"Swap Fees": "0.5% protocol routing fee collected on DEX swaps.",
		"Limit Order Fees": "0.1% protocol fee collected on executed limit orders.",
	},
	ProtocolRevenue: {
		"Swap Fees": "0.5% protocol routing fee collected on DEX swaps.",
		"Limit Order Fees": "0.1% protocol fee collected on executed limit orders.",
	},
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	chains: [CHAIN.BSC],
	fetch,
	start: "2026-03-23",
	methodology,
	breakdownMethodology,
};

export default adapter;
