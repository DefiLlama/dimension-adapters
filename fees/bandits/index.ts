import type { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const sellEvent =
	"event PendingSellReduced(address indexed user, uint256 goldAmount, uint256 penaltyAmount, uint256 amountToLiquidity)";

const buyEvent =
	"event Buy(address indexed user, uint256 amount, uint256 amountOut, uint256 amountInAfterFee)";

const swapEvent =
	"event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,address indexed to)";
const skimmingEvent =
	"event RoundEnded(uint256 indexed round,bytes32 seed,uint256 aggregatedSecret,uint256 cutoffPercentage,uint256 totalSkimmedCollateral,uint256 skimmingBlockNumber)";

const liquidationEvent =
	"event Liquidated(address indexed user, uint256 goldSeized, uint256 collateralSeized)";

// TODO: update contract info later
const PAIR_CONTRACT = "";
const STABLE_TOKEN = "";
const GOLD_TOKEN = "";
const STAKING_CONTRACT = "";
const LEDGER_CONTRACT = "";
const LIQUIDATOR_CONTRACT = "";

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
	const dailyVolume = createBalances();
	const dailyFees = createBalances();

	const swapEvents = await getLogs({
		targets: [PAIR_CONTRACT],
		eventAbi: swapEvent,
	});
	for (const l of swapEvents) {
		if (l.amount1In > 0) {
			dailyVolume.add(STABLE_TOKEN, l.amount1In);
		} else {
			dailyVolume.add(STABLE_TOKEN, l.amount1Out);
		}
	}

	const buy = await getLogs({
		targets: [LEDGER_CONTRACT],
		eventAbi: buyEvent,
	});
	for (const l of buy) {
		dailyFees.add(STABLE_TOKEN, (l.amountInAfterFee * 100) / 98);
	}

	const sell = await getLogs({
		targets: [LEDGER_CONTRACT],
		eventAbi: sellEvent,
	});
	for (const l of sell) {
		dailyFees.add(STABLE_TOKEN, (l.amountToLiquidity * 100) / 98);
		dailyFees.add(GOLD_TOKEN, (l.penaltyAmount * 100) / 98);
	}

	const skimming = await getLogs({
		targets: [STAKING_CONTRACT],
		eventAbi: skimmingEvent,
	});
	for (const l of skimming) {
		dailyFees.add(STABLE_TOKEN, l.totalSkimmedCollateral);
	}

	const liquidations = await getLogs({
		targets: [LIQUIDATOR_CONTRACT],
		eventAbi: liquidationEvent,
	});
	for (const l of liquidations) {
		dailyFees.add(STABLE_TOKEN, l.collateralSeized);
		dailyFees.add(GOLD_TOKEN, l.goldSeized);
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
		[CHAIN.BSC]: { fetch, start: "2025-12-5" },
	},
};
