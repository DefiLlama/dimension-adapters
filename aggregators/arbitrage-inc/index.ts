import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";
import { ethers } from "ethers";

// Dedicated BSC swap fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol swap fees.
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// Dedicated BSC limit-order fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol limit-order fees.
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";
// Treasury wallet for the 40% RevShare allocation documented in PR #9453.
// This EOA is used only for the dedicated tax allocation; getETHReceived counts all native BNB inflows to it.
const TREASURY_WALLET = "0x66BB01F14229E2179bAD84D52A69C0e4628dE63f";

// Legacy receiver and tax accumulator used before the October 1, 2026 migration.
const LEGACY_SWAP_FEE_RECEIVER = "0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7";
const TAX_ACCUMULATOR = "0x4c1caA917FD012b285Ba35E93535675e5B59806C";
const ARB_TOKEN = "0x5EE54869Ecd5E752C31aF095187326D4A4D50e1c";

const RECEIVER_MIGRATION_TIMESTAMP = 1790812800;
const LEGACY_FEE_RATE_CHANGE_TIMESTAMP = 1780876800;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Protocol fee rates used to infer routed volume from each dedicated receiver.
const SWAP_FEE_RATE = 0.005;
const LIMIT_ORDER_FEE_RATE = 0.001;
// RevShare policy documented in PR #9453: 40% treasury allocation and 73% net distribution.
const TREASURY_ALLOCATION = 0.40;
const SAFE_FACTOR = 0.73;

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

const fetchCurrent = async (options: FetchOptions) => {
	const [swapFees, limitOrderFees, treasuryAllocation] = await Promise.all([
		addTokensReceived({ options, targets: [SWAP_FEE_RECEIVER] }),
		addTokensReceived({ options, targets: [LIMIT_ORDER_FEE_RECEIVER] }),
		getETHReceived({ options, target: TREASURY_WALLET }),
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

const fetch = async (options: FetchOptions) => {
	const timestamp = options.startTimestamp ?? options.startOfDay;
	return timestamp < RECEIVER_MIGRATION_TIMESTAMP ? fetchLegacy(options) : fetchCurrent(options);
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	chains: [CHAIN.BSC],
	start: "2026-03-23",
	dependencies: [Dependencies.ALLIUM],
	methodology: {
		Volume: "Before October 1, 2026, routed swap volume is estimated from the legacy receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7 using the historical 0.1%/0.5% fee transition; from October 1, 2026, swap and limit-order volume use the dedicated receivers at 0.5% and 0.1%. The dedicated receivers are used only for their stated protocol fee streams.",
		Fees: "Before October 1, 2026, fees include the legacy swap receiver and ARB INC token transfer tax. From October 1, 2026, fees include the dedicated swap receiver, dedicated limit-order receiver, and BNB tax proceeds from the dedicated treasury.",
		Revenue: "The adapter preserves legacy swap and token-tax accounting before October 1, 2026 and uses the new dedicated receiver and treasury accounting from that date onward. The configured wallets are dedicated to protocol flows; native BNB is recipient-based through getETHReceived.",
		ProtocolRevenue: "Before October 1, 2026, 100% of legacy swap fees and 60% of token tax are protocol revenue. From October 1, 2026, 100% of dedicated swap and limit-order fees plus 70.8% of realized BNB tax are protocol revenue.",
		HoldersRevenue: "Before October 1, 2026, holders receive 29.2% of token tax. From October 1, 2026, holders receive 29.2% of realized BNB tax, calculated as the 40% treasury allocation multiplied by the 0.73 safety factor.",
	},
	breakdownMethodology: {
		Volume: {
			"Swap Volume": "Routed swap volume: before October 1, 2026, legacy swap fees divided by the date-aware 0.1%/0.5% fee rate; from October 1, 2026, dedicated swap fees divided by 0.5%.",
			"Limit Order Volume": "From October 1, 2026, routed limit-order volume estimated from the dedicated limit-order receiver's fees divided by the 0.1% fee rate.",
		},
		Fees: {
			"Legacy Swap Fees": "Pre-migration fees received by the legacy swap receiver 0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7, excluding transfers originating from the tax accumulator.",
			"Legacy Token Transfer Tax": "Pre-migration ARB INC token tax received by the tax accumulator 0x4c1caA917FD012b285Ba35E93535675e5B59806C.",
			"Kyber Swap Fees": "Post-migration fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC.",
			"Kyber Limit Order Fees": "Post-migration fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219.",
			"ARB INC Tax Realized In BNB": "Post-migration native BNB received by the dedicated treasury 0x66BB01F14229E2179bAD84D52A69C0e4628dE63f, grossed up from its 40% allocation; direct BNB deposits to this EOA cannot be distinguished by getETHReceived.",
		},
		Revenue: {
			"Legacy Swap Revenue": "Pre-migration legacy swap fees retained by the protocol.",
			"Legacy Tax Revenue": "Pre-migration ARB INC token tax before the holder allocation.",
			"Kyber Swap Revenue": "Post-migration swap fees retained by the protocol.",
			"Kyber Limit Order Revenue": "Post-migration limit-order fees retained by the protocol.",
			"ARB INC Tax Revenue": "Post-migration realized ARB INC tax proceeds before the holder allocation; the treasury is dedicated to this tax flow.",
		},
		ProtocolRevenue: {
			"Legacy Swap Fees To Protocol": "100% of pre-migration legacy swap fees.",
			"Legacy Tax To Protocol": "60% of pre-migration ARB INC token tax.",
			"Swap Fees To Protocol": "100% of post-migration fees received by the dedicated swap receiver.",
			"Limit Order Fees To Protocol": "100% of post-migration fees received by the dedicated limit-order receiver.",
			"ARB INC Tax To Protocol": "The 70.8% post-migration protocol allocation of realized ARB INC tax proceeds.",
		},
		HoldersRevenue: {
			"Legacy ARB INC Holder Revenue": "29.2% of pre-migration ARB INC token tax.",
			"ARB INC Holder Revenue": "29.2% of post-migration realized ARB INC tax proceeds; internal points allocate this amount among eligible holders.",
		},
	},
};

export default adapter;
