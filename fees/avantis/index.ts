import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, FetchResultFees, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";
import { getPositionedLogArgs } from "../../helpers/logs";

interface IData {
	success: boolean;
	history: {
		date: string;
		totalOpeningFee: number;
		totalClosingFee: number;
		totalWinFees: number;
		totalRolloverFee: number;
		totalMarginUpdateFee: number;
		totalRollAdjustmentFee: number;
	}[];
}

const API_URL = "https://api.avantisfi.com/v1";
// The API sums, per UTC day: opening fees (TradingStorage FeesCharged), closing fees and rollover (PairInfos
// 0x81F22d0Cc22977c91bEfE648C9fddf1f2bd977e5 FeesCharged; the closing fee of a Upside/zero-fee trade is reported as
// totalWinFees), borrow fees settled on margin updates, futures rolls and size increases (Trading MarginUpdated,
// TradingStorage RollAdjustmentDone, TradingCallbacks PositionIncreaseRegistered). Funding (V2) is paid between traders
// and is left out.

const START = '2024-01-27';
const TRADING_STORAGE = '0x8a311d7048c35985aa31c131b9a13e03a5f7422d';
const TRADING_CALLBACKS = '0x0C16ff40065Cc3Ab4bc55B60E447504AFB9C7970';
const EXECUTE = '0xdbdd7b8a8747904f53eb7aef655a6ff81e2c306a';

// The protocol's cut of every opening, closing and profit-share fee (after the referral rebate) accrues in
// TradingStorage devFeesUSDC + govFeesUSDC until it is claimed; the rest of the fee goes to the LP vault. The cut is
// TradingCallbacks.vaultFeeP() (read on-chain at the change blocks): 20% until 2024-08-21 (block 18734114), 40% until
// 2025-09-08 (block 35264936), 0% until 2026-03-10 (block 43186546), 30% since.
// The treasury claimed the cut until 2025-09-08; since 2026-03-10 it is claimed by the buybacks keeper, which buys AVNT
// on the open market and burns it (Buyback 0xa75886adA4dE4BA28F2385615216E48e7bEA1410).
const BUYBACK_START = '2026-03-10';
// every way the counters go down; added back so the day's accrual is exact
const COUNTER_DECREMENT_EVENTS = [
	'event BuybackFeeClaimed(address buybacksKeeper, uint256 govFees, uint256 devFees)',
	'event FeesClaimed(address govTreasury, uint256 govFees, address devTreasury, uint256 devFees)',
	'event FeesDecremented(uint256 devAmount, uint256 govAmount)',
];

// TP/SL closes and liquidations can only be executed by operators whitelisted by Avantis (Trading.executeLimitOrder is
// onlyOperator in V1 and V2), and Execute pays the execution reward to that operator out of the closing fee, so the
// reward stays with the protocol. order: 0 = TP, 1 = SL, 2 = liquidation, 3 = limit open
const TRIGGER_REWARDED_EVENT = 'event TriggerRewarded((address trader, uint256 pairIndex, uint256 index, uint8 order) id, uint256 reward)';
const LIQUIDATION_ORDER = 2;
// fills that tell whether a rewarded close was an Upside (zero-fee, isPnl) trade, whose closing fee the API reports in totalWinFees
const TRADE_TUPLE = '(address trader, uint256 pairIndex, uint256 index, uint256 initialPosToken, uint256 positionSizeUSDC, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl, uint256 timestamp) t';
const LIMIT_EXECUTED_V1_5 = `event LimitExecuted(uint256 orderId, uint256 limitIndex, ${TRADE_TUPLE}, uint8 orderType, uint256 price, uint256 positionSizeUSDC, int256 percentProfit, uint256 usdcSentToTrader, bool isPnl)`;
const LIMIT_EXECUTED_V2 = `event LimitExecuted(uint256 orderId, uint256 limitIndex, ${TRADE_TUPLE}, uint8 orderType, uint256 price, uint256 positionSizeUSDC, int256 percentProfit, uint256 usdcSentToTrader, bool isPnl, uint256 coinExposure)`;
const V2_UPGRADE = '2026-08-12'; // block 49874539, 12:40 UTC

const LABELS = {
	UPSIDE_PROFIT_SHARE: 'Upside Profit Share',
	TO_LPS: 'Trading Fees To LPs',
	REFERRAL_REBATES: 'Referral Rebates',
	TO_TREASURY: 'Trading Fees To Treasury',
	LIQUIDATION_FEES_TO_PROTOCOL: 'Liquidation Fees To Protocol',
	EXECUTION_FEES_TO_PROTOCOL: 'TP/SL Execution Fees To Protocol',
};

const getProtocolCut = async (options: FetchOptions): Promise<number> => {
	const fromBlock = await options.getFromBlock();
	const counters = async (api: FetchOptions['api']) => {
		const dev = await api.call({ target: TRADING_STORAGE, abi: 'uint256:devFeesUSDC' });
		const gov = await api.call({ target: TRADING_STORAGE, abi: 'uint256:govFeesUSDC' });
		return Number(dev) + Number(gov);
	};
	// TradingStorage was deployed during the first day, so its counters start at 0
	const startCounters = options.dateString === START ? 0 : await counters(options.fromApi);
	let accrued = await counters(options.toApi) - startCounters;
	for (const eventAbi of COUNTER_DECREMENT_EVENTS) {
		const logs = await getPositionedLogArgs(options, { target: TRADING_STORAGE, eventAbi });
		// the counters read at fromBlock already include that block's claims
		for (const log of logs.filter((l) => l.blockNumber > fromBlock)) {
			accrued += Number(log.govFees ?? log.govAmount) + Number(log.devFees ?? log.devAmount);
		}
	}
	return accrued / 1e6;
};

const getExecutionRewards = async (options: FetchOptions) => {
	const rewards = { liquidation: 0, execution: 0, upside: 0 };
	const rewardLogs = (await options.getLogs({ target: EXECUTE, eventAbi: TRIGGER_REWARDED_EVENT, onlyArgs: false }))
		.filter((log: any) => Number(log.args.reward) > 0);
	if (!rewardLogs.length) return rewards;

	const fillEvents = [
		...(options.dateString <= V2_UPGRADE ? [LIMIT_EXECUTED_V1_5] : []),
		...(options.dateString >= V2_UPGRADE ? [LIMIT_EXECUTED_V2] : []),
	];
	const upsideCloses = new Set<string>();
	for (const eventAbi of fillEvents) {
		const fills = await options.getLogs({ target: TRADING_CALLBACKS, eventAbi, onlyArgs: false });
		for (const fill of fills) {
			const { t, isPnl } = fill.args;
			if (isPnl) upsideCloses.add(`${fill.transactionHash}-${t.trader}-${t.pairIndex}-${t.index}`.toLowerCase());
		}
	}

	for (const log of rewardLogs) {
		const { id, reward } = log.args;
		const amount = Number(reward) / 1e6;
		if (Number(id.order) === LIQUIDATION_ORDER) rewards.liquidation += amount;
		else rewards.execution += amount;
		if (upsideCloses.has(`${log.transactionHash}-${id.trader}-${id.pairIndex}-${id.index}`.toLowerCase())) rewards.upside += amount;
	}
	return rewards;
};

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
	const dateStr = options.dateString;
	// the API returns every day from `daysAgo` days back until today, so ask for enough days to cover the requested one
	// (the /cached/ endpoint only keeps the last 365 days, which made older days impossible to refill)
	const daysAgo = Math.ceil((Date.now() / 1000 - options.startOfDay) / 86400) + 1;

	const value: IData = await fetchURL(`${API_URL}/history/analytics/total-fees/${daysAgo}`);
	if (!value.success) throw new Error("avantis: failed to fetch fees");
	const row = value.history.find((d) => d.date === dateStr);
	if (!row) throw new Error(`avantis: no fee row for ${dateStr}`);

	const rewards = await getExecutionRewards(options);
	const totalRewards = rewards.liquidation + rewards.execution;
	// the reward is part of the closing fee the API reports: take it out of the bucket it landed in, then show
	// liquidation fees on their own and TP/SL execution fees with the other closing fees
	const openCloseFees = row.totalOpeningFee + row.totalClosingFee - (totalRewards - rewards.upside) + rewards.execution;
	const upsideProfitShare = row.totalWinFees - rewards.upside;
	const marginFees = row.totalRolloverFee + row.totalMarginUpdateFee + row.totalRollAdjustmentFee;
	const totalFees = row.totalOpeningFee + row.totalClosingFee + row.totalWinFees + marginFees;

	const dailyFees = options.createBalances();
	dailyFees.addUSDValue(openCloseFees, METRIC.OPEN_CLOSE_FEES);
	dailyFees.addUSDValue(upsideProfitShare, LABELS.UPSIDE_PROFIT_SHARE);
	dailyFees.addUSDValue(rewards.liquidation, METRIC.LIQUIDATION_FEES);
	dailyFees.addUSDValue(marginFees, METRIC.MARGIN_FEES);

	const protocolCut = await getProtocolCut(options);

	const referralLogs = await options.getLogs({
		target: TRADING_STORAGE,
		eventAbi: 'event TradeReferred(address _trader, address _referrer, uint256 _leveragedPosition, uint256 _traderFeePostDiscount, uint256 _startingFees, uint256 _referrerRebate, uint256 _pairIndex)',
	});
	const referralRebates = referralLogs.reduce((sum: number, log: any) => sum + Number(log._referrerRebate), 0) / 1e6;

	const dailySupplySideRevenue = options.createBalances();
	dailySupplySideRevenue.addUSDValue(totalFees - totalRewards - protocolCut - referralRebates, LABELS.TO_LPS);
	dailySupplySideRevenue.addUSDValue(referralRebates, LABELS.REFERRAL_REBATES);

	const dailyProtocolRevenue = options.createBalances();
	const dailyHoldersRevenue = options.createBalances();
	dailyProtocolRevenue.addUSDValue(rewards.liquidation, LABELS.LIQUIDATION_FEES_TO_PROTOCOL);
	dailyProtocolRevenue.addUSDValue(rewards.execution, LABELS.EXECUTION_FEES_TO_PROTOCOL);
	if (dateStr >= BUYBACK_START) dailyHoldersRevenue.addUSDValue(protocolCut, METRIC.TOKEN_BUY_BACK);
	else dailyProtocolRevenue.addUSDValue(protocolCut, LABELS.TO_TREASURY);

	const dailyRevenue = dailyProtocolRevenue.clone();
	dailyRevenue.addBalances(dailyHoldersRevenue);

	return {
		dailyFees,
		dailyUserFees: dailyFees,
		dailyRevenue,
		dailyProtocolRevenue,
		dailyHoldersRevenue,
		dailySupplySideRevenue,
	};
};

const methodology = {
	Fees: "Opening and closing fees, liquidation fees, the profit share charged on winning Upside (zero-fee) trades, and rollover fees for holding positions. Funding is paid between traders and is not counted.",
	UserFees: "All fees are paid by traders.",
	Revenue: "Liquidation and TP/SL execution fees kept by the protocol's keepers, plus the protocol's share of opening, closing and profit-share fees after referral rebates (20% until 2024-08-21, 40% until 2025-09-08, 0% until 2026-03-10, 30% since).",
	ProtocolRevenue: "Liquidation and TP/SL execution fees kept by the protocol's keepers, plus the protocol's share of trading fees sent to the treasury until 2025-09-08.",
	HoldersRevenue: "Since 2026-03-10, the protocol's 30% share of opening, closing and profit-share fees funds market buybacks of AVNT, which are burned.",
	SupplySideRevenue: "Rollover fees and the rest of the trading fees paid to liquidity providers in the Avantis vault, and referral rebates paid to referrers.",
};

const breakdownMethodology = {
	Fees: {
		[METRIC.OPEN_CLOSE_FEES]: "Fees charged when traders open and close positions, including the execution fee on TP/SL closes.",
		[LABELS.UPSIDE_PROFIT_SHARE]: "Share of profit charged on winning Upside (zero-fee perpetual) trades, which pay no opening or closing fee.",
		[METRIC.LIQUIDATION_FEES]: "Fee taken from the collateral of liquidated positions and paid to the keeper that executes the liquidation.",
		[METRIC.MARGIN_FEES]: "Rollover (borrow) fees for holding positions, settled on close, margin updates, size increases and futures rolls.",
	},
	Revenue: {
		[LABELS.LIQUIDATION_FEES_TO_PROTOCOL]: "Liquidation fees paid to the protocol's whitelisted keepers.",
		[LABELS.EXECUTION_FEES_TO_PROTOCOL]: "TP/SL execution fees paid to the protocol's whitelisted keepers.",
		[LABELS.TO_TREASURY]: "The protocol's share of trading fees after referral rebates, sent to the treasury (20% until 2024-08-21, 40% until 2025-09-08, 0% after).",
		[METRIC.TOKEN_BUY_BACK]: "The protocol's 30% share of trading fees after referral rebates, used to buy back and burn AVNT since 2026-03-10.",
	},
	ProtocolRevenue: {
		[LABELS.LIQUIDATION_FEES_TO_PROTOCOL]: "Liquidation fees paid to the protocol's whitelisted keepers.",
		[LABELS.EXECUTION_FEES_TO_PROTOCOL]: "TP/SL execution fees paid to the protocol's whitelisted keepers.",
		[LABELS.TO_TREASURY]: "The protocol's share of trading fees after referral rebates, sent to the treasury (20% until 2024-08-21, 40% until 2025-09-08, 0% after).",
	},
	HoldersRevenue: {
		[METRIC.TOKEN_BUY_BACK]: "The protocol's 30% share of trading fees after referral rebates, used to buy back and burn AVNT since 2026-03-10.",
	},
	SupplySideRevenue: {
		[LABELS.TO_LPS]: "All rollover fees and the rest of the opening, closing and profit-share fees, paid to liquidity providers in the Avantis vault.",
		[LABELS.REFERRAL_REBATES]: "Share of trading fees paid to referrers.",
	},
};

const adapter: SimpleAdapter = {
	version: 1,
	fetch,
	chains: [CHAIN.BASE],
	start: START,
	methodology,
	breakdownMethodology,
};

export default adapter;
