import type { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const swapEvent =
	"event Swap(address indexed sender,uint256 inputAmount,address indexed inputToken,uint256 amountOut,address indexed outputToken,int256 slippage,uint32 referralCode,address to)";
const quoteEvent =
	"event Fee(address feeToken, uint256 feeAmount, uint256 obQuote, uint256 bexQuote, uint256 kodiakQuote)";

const OBEXECUTOR_FEE_MODULE: Record<string, string[]> = {
	[CHAIN.BERACHAIN]: [
		"0xF83ECD5511cf190764Be32D2F9eCeD57a8676cdc",
		"0xCE33Ec5E1BA85EB9485dDB2DF3610186cA3b6a35",
	],
	[CHAIN.HYPERLIQUID]: ["0x53A8EC5a42106FC8B2AB1468c3DA363F1bA49266"],
	[CHAIN.MONAD]: ["0x8577D77C67A77E5C55592Ede1fa117306E7C0757"],
	[CHAIN.BOTANIX]: ["0xdF90E29d435E492f26CAc53a52fc4cDe6327E63E"],
};

const OBROUTER: Record<string, string> = {
	[CHAIN.BERACHAIN]: "0xFd88aD4849BA0F729D6fF4bC27Ff948Ab1Ac3dE7",
	[CHAIN.HYPERLIQUID]: "0x5fbD1B5AA82d09359C05428647871fe9aDd3F411",
	[CHAIN.MONAD]: "0x5fbD1B5AA82d09359C05428647871fe9aDd3F411",
	[CHAIN.BOTANIX]: "0x417fBC387fa853AEd674d62Ca1b21E3cE54C0F85",
};

const fetch = async ({ getLogs, createBalances, chain }: FetchOptions) => {
	const dailyVolume = createBalances();
	const dailyFees = createBalances();

	const swapEvents = await getLogs({
		targets: [OBROUTER[chain]],
		eventAbi: swapEvent,
	});
	for (const l of swapEvents) {
		dailyVolume.add(l.outputToken, l.amountOut);
	}

	// Positive slippage
	for (const l of swapEvents) {
		if (l.slippage > 0n) {
			dailyFees.add(l.outputToken, l.slippage);
		}
	}

	// Swap fees
	const feeEvents = await getLogs({
		targets: OBEXECUTOR_FEE_MODULE[chain],
		eventAbi: quoteEvent,
	});

	for (const l of feeEvents) {
		if (l.feeAmount > 0n) {
			dailyFees.add(l.feeToken, l.feeAmount);
		}
	}

	return {
		dailyVolume,
		dailyFees,
		dailyUserFees: dailyFees,
		dailyRevenue: dailyFees,
		dailyProtocolRevenue: dailyFees,
	};
};

const methodology = {
	Fees: "All trading fees paid by users.",
	UserFees: "All trading fees paid by users.",
	Revenue: "100% fees collected by the protocol.",
	ProtocolRevenue: "100% fees collected by the protocol.",
};

export default {
	version: 2,
	methodology,
	adapter: {
		[CHAIN.BERACHAIN]: { fetch, start: "2025-01-27" },
		[CHAIN.HYPERLIQUID]: { fetch, start: "2025-08-01" },
		[CHAIN.MONAD]: { fetch, start: "2025-11-24" },
		[CHAIN.BOTANIX]: { fetch, start: "2025-10-16" },
	},
};
