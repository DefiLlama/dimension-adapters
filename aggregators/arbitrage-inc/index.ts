import { Dependencies, type FetchOptions, type SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived } from "../../helpers/token";

// Dedicated BSC swap fee receiver activated in the October 1, 2026 receiver migration.
const SWAP_FEE_RECEIVER = "0x0F477f8c88b48E299AcE83B14303157d032382EC";
// Dedicated BSC limit-order fee receiver activated in the October 1, 2026 receiver migration.
const LIMIT_ORDER_FEE_RECEIVER = "0x75F7F06a5C5c440c1aDbd586826CD26253EDE219";
// Treasury wallet for the 40% RevShare allocation documented in PR #9453.
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
		Volume: "Swap volume is collected from the dedicated swap fee receiver at 0.5%; limit-order volume is collected from the dedicated limit-order receiver at 0.1%. Personal activity and the separate 40% team receiver are excluded.",
		Fees: "Kyber swap fees, Kyber limit-order fees, and ARB INC transfer-tax proceeds realized in BNB from the dedicated treasury allocation.",
		Revenue: "All collected Kyber fees and realized ARB INC tax proceeds. Personal activity is excluded.",
		ProtocolRevenue: "100% of Kyber swap and limit-order fees plus the 70.8% protocol allocation of realized ARB INC tax proceeds.",
		HoldersRevenue: "29.2% of realized ARB INC tax proceeds, calculated as the 40% treasury allocation multiplied by the 0.73 safety factor.",
	},
	breakdownMethodology: {
		Volume: {
			"Swap Volume": "Routed volume estimated from the dedicated swap receiver's fees divided by the 0.5% swap fee rate.",
			"Limit Order Volume": "Routed volume estimated from the dedicated limit-order receiver's fees divided by the 0.1% limit-order fee rate.",
		},
		Fees: {
			"Kyber Swap Fees": "Fees received by the dedicated swap receiver.",
			"Kyber Limit Order Fees": "Fees received by the dedicated limit-order receiver.",
			"ARB INC Tax Realized In BNB": "Tax proceeds grossed up from the dedicated treasury's 40% allocation.",
		},
		Revenue: {
			"Kyber Swap Revenue": "Swap fees retained by the protocol.",
			"Kyber Limit Order Revenue": "Limit-order fees retained by the protocol.",
			"ARB INC Tax Revenue": "All realized ARB INC tax proceeds before any holder allocation; no supply-side costs are reported.",
		},
		ProtocolRevenue: {
			"Swap Fees To Protocol": "100% of fees received by the dedicated swap receiver.",
			"Limit Order Fees To Protocol": "100% of fees received by the dedicated limit-order receiver.",
			"ARB INC Tax To Protocol": "The 70.8% protocol allocation of realized ARB INC tax proceeds.",
		},
		HoldersRevenue: {
			"ARB INC Holder Revenue": "29.2% of realized ARB INC tax proceeds; internal points only allocate this amount among eligible holders.",
		},
	},
};

export default adapter;
