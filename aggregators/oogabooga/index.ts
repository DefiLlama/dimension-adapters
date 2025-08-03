import type { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const swapEvent =
	"event Swap(address indexed sender,uint256 inputAmount,address indexed inputToken,uint256 amountOut,address indexed outputToken,int256 slippage,uint32 referralCode,address to)";

const quoteEvent =
	"event Fee(address feeToken, uint256 feeAmount, uint256 obQuote, uint256 bexQuote, uint256 kodiakQuote)";

const OBEXECUTOR_FEE_MODULE = {
	[CHAIN.BERACHAIN]: [
		"0xF83ECD5511cf190764Be32D2F9eCeD57a8676cdc",
		"0xCE33Ec5E1BA85EB9485dDB2DF3610186cA3b6a35",
	],
	[CHAIN.HYPERLIQUID]: ["0x53A8EC5a42106FC8B2AB1468c3DA363F1bA49266"],
} as const;

const OBROUTER = {
	[CHAIN.BERACHAIN]: "0xFd88aD4849BA0F729D6fF4bC27Ff948Ab1Ac3dE7",
	[CHAIN.HYPERLIQUID]: "0x5fbD1B5AA82d09359C05428647871fe9aDd3F411",
} as const;

const fetch =
	(chainId: CHAIN) =>
	async ({ getLogs, createBalances }: FetchOptions) => {
		const dailyVolume = createBalances();
		const dailyFees = createBalances();

		const swapEvents = await getLogs({
			targets: [OBROUTER[chainId]],
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
			targets: OBEXECUTOR_FEE_MODULE[chainId],
			eventAbi: quoteEvent,
		});

		for (const l of feeEvents) {
			if (l.feeAmount > 0n) {
				dailyFees.add(l.feeToken, l.feeAmount);
			}
		}

		return { dailyVolume, dailyRevenue: dailyFees };
	};

export default {
	version: 2,
	adapter: {
		[CHAIN.BERACHAIN]: {
			fetch: fetch(CHAIN.BERACHAIN),
			start: 324008,
		},
		[CHAIN.HYPERLIQUID]: {
			fetch: fetch(CHAIN.HYPERLIQUID),
			start: 9974083,
		},
	},
};
