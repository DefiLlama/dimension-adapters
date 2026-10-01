import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";

// Dedicated BSC swap fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol swap fees.
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// Dedicated BSC limit-order fee receiver activated in the October 1, 2026 receiver migration.
// This address is used only for protocol limit-order fees.
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";
// Treasury wallet for the 40% RevShare allocation documented in PR #9453.
// This EOA is used only for the dedicated tax allocation; getETHReceived counts all native BNB inflows to it.
const TREASURY_WALLET = "0x66BB01F14229E2179bAD84D52A69C0e4628dE63f";

// Protocol fee rates used to infer routed volume from each dedicated receiver.
const SWAP_FEE_RATE = 0.005;
const LIMIT_ORDER_FEE_RATE = 0.001;
// RevShare policy documented in PR #9453: 40% treasury allocation and 73% net distribution.
const TREASURY_ALLOCATION = 0.40;
const SAFE_FACTOR = 0.73;

const fetch = async (options: FetchOptions) => {
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

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	chains: [CHAIN.BSC],
	start: "2026-03-23",
	dependencies: [Dependencies.ALLIUM],
	methodology: {
		Volume: "Swap volume is estimated from fees sent to the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC at 0.5%; limit-order volume is estimated from fees sent to the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219 at 0.1%. Each receiver is used only for its stated protocol fee stream; personal activity and the separate 40% team receiver are excluded.",
		Fees: "Kyber swap fees from 0x0F477f8c88b48E299AcE83B14303157d032382EC, Kyber limit-order fees from 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219, and ARB INC transfer-tax proceeds realized in BNB at the dedicated treasury 0x66BB01F14229E2179bAD84D52A69C0e4628dE63f.",
		Revenue: "All collected Kyber fees and realized ARB INC tax proceeds. The three configured wallets are dedicated to these protocol flows and are not used for personal or unrelated operations. Native BNB is read by recipient address through getETHReceived, so direct BNB deposits to the treasury would also be included.",
		ProtocolRevenue: "100% of Kyber swap and limit-order fees plus the 70.8% protocol allocation of realized ARB INC tax proceeds.",
		HoldersRevenue: "29.2% of realized ARB INC tax proceeds, calculated as the 40% treasury allocation multiplied by the 0.73 safety factor.",
	},
	breakdownMethodology: {
		Volume: {
			"Swap Volume": "Routed volume estimated from fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC, divided by the 0.5% swap fee rate.",
			"Limit Order Volume": "Routed volume estimated from fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219, divided by the 0.1% limit-order fee rate.",
		},
		Fees: {
			"Kyber Swap Fees": "Fees received by the dedicated swap receiver 0x0F477f8c88b48E299AcE83B14303157d032382EC; the wallet is used only for protocol swap fees.",
			"Kyber Limit Order Fees": "Fees received by the dedicated limit-order receiver 0x75F7F06a5C5c440c1aDbd586826CD26253EDE219; the wallet is used only for protocol limit-order fees.",
			"ARB INC Tax Realized In BNB": "All native BNB received by the dedicated treasury 0x66BB01F14229E2179bAD84D52A69C0e4628dE63f, grossed up from its 40% allocation; direct BNB deposits to this EOA cannot be distinguished by getETHReceived.",
		},
		Revenue: {
			"Kyber Swap Revenue": "Swap fees retained by the protocol.",
			"Kyber Limit Order Revenue": "Limit-order fees retained by the protocol.",
			"ARB INC Tax Revenue": "All realized ARB INC tax proceeds before any holder allocation; the treasury is dedicated to this tax flow, and no supply-side costs are reported.",
		},
		ProtocolRevenue: {
			"Swap Fees To Protocol": "100% of fees received by the dedicated swap receiver.",
			"Limit Order Fees To Protocol": "100% of fees received by the dedicated limit-order receiver.",
			"ARB INC Tax To Protocol": "The 70.8% protocol allocation of realized ARB INC tax proceeds received by the dedicated treasury.",
		},
		HoldersRevenue: {
			"ARB INC Holder Revenue": "29.2% of realized ARB INC tax proceeds; internal points only allocate this amount among eligible holders.",
		},
	},
};

export default adapter;
