import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Holdstation DeFutures is a gTrade v6 fork: every fill and every fee is emitted by its TradingCallbacks contract.
// The adapter used Holdstation's per-chain APIs, which now return 502 on every path, the host root included
// (worldfuture.holdstation.com since 2026-11-04, bnbfutures.holdstation.com since May 2026), so it reads the
// callbacks events directly. Callbacks addresses come from the trading storage's AddressUpdated("callbacks") events.

type Callbacks = { address: string; from?: number; to?: number };
type ChainConfig = {
	start: string;
	deadFrom?: string;
	collateral: string; // token returned by usdc() on the chain's trading storage
	callbacks: Callbacks[];
	noFeePairs?: number[];
};

const chainConfig: Record<string, ChainConfig> = {
	// api-trading-bera.holdstation.com is down; last stored Berachain day is 2025-09-16. Re-enabling needs its
	// callbacks contract.
	// [CHAIN.BERACHAIN]: {
	// 	start: "2025-02-07",
	// },
	[CHAIN.WC]: {
		start: "2025-06-04",
		collateral: ADDRESSES.wc.WLD,
		// Storage was redeployed on 2026-01-29 (0xdE605A918C466e74A2a12865EFE616d51391312A ->
		// 0x441b81f9ACeBEc2C855E8DbDaA82967fEa185169). The old callbacks' last log is 02:37 UTC and the new one was
		// wired at 10:41 UTC; the cutover sits between them (same timestamp as open-interest/holdstation-defutures-oi.ts).
		callbacks: [
			{ address: "0x77C99D471CCdD8898DAaF63Ff9044F204065BB35", to: 1769681009 },
			{ address: "0x7A7f6aD9Ad93Ea8D70025C02439b39e8CAB2332e", from: 1769681009 },
		],
	},
	[CHAIN.BSC]: {
		start: "2025-09-03",
		// last fill on BNB Chain was 2026-05-13 06:52 UTC, nothing on any Holdstation callbacks since
		deadFrom: "2026-05-14",
		collateral: ADDRESSES.bsc.USD1,
		// Storage 0x8E2D60AC9238C46422005C8A8855d2ece37B3f86 (last log 2026-01-28 17:55 UTC) was replaced by
		// 0x2E7c3b1f6DE7ADA1e28ad663f102AEE021D417aF, whose callbacks was wired 2026-01-30 08:57:35 UTC. The new storage
		// has the same gov address (0x6D93D3482b093C441D3e536AFA8e71C87083622D) as the new World Chain storage.
		callbacks: [
			{ address: "0x239B4dBf964dF383ae79c4fAE2bBD92438cEB1aD", to: 1769763455 },
			{ address: "0xF1152E9d9547Df46086Dc6890acE358D57F7B961", from: 1769763455 },
		],
		// Fee group 4 on both storages' pairsStorage: pairOpenFeeP/pairCloseFeeP = 100 (0.000001%), i.e. no trading
		// fee. USDC/USD and the */USD1 pairs (BTC, ETH, BNB, GBP/JPY, EUR, GBP, AAPL, GOOGL, XAU, OIL) carried about
		// $34B of notional against ~$30 of fees from Sep 2025 to Jan 2026, so their fills are left out of volume.
		noFeePairs: [40, 97, 98, 99, 102, 103, 104, 105, 106, 107, 108],
	},
};

const TRADE = "(address trader, uint256 pairIndex, uint256 index, uint256 initialPosToken, uint256 positionSizeUsdc, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl) t";
const EVENTS = {
	marketExecuted: `event MarketExecuted(uint256 indexed orderId, ${TRADE}, bool open, uint256 price, uint256 priceImpactP, uint256 positionSizeUsdc, int256 percentProfit, uint256 usdcSentToTrader)`,
	limitExecuted: `event LimitExecuted(uint256 indexed orderId, uint256 limitIndex, ${TRADE}, address indexed nftHolder, uint8 orderType, uint256 price, uint256 priceImpactP, uint256 positionSizeUsdc, int256 percentProfit, uint256 usdcSentToTrader)`,
	// opening/closing fee, also charged on cancelled market orders; credited to the dev and gov addresses.
	// The BNB Chain callbacks switched to the three-argument version on 2025-08-22 (its bool is true in every log).
	devGovFee: "event DevGovFeeCharged(address indexed trader, uint256 valueUsdc)",
	devGovFeeV2: "event DevGovFeeCharged(address indexed trader, uint256 valueUsdc, bool flag)",
	// closing fee sent to the vault that takes the other side of every trade
	vaultFee: "event UsdcVaultFeeCharged(address indexed trader, uint256 valueUsdc)",
	// fee on limit, stop and liquidation orders, paid to the bot that triggers them
	botFee: "event NftBotFeeCharged(address indexed trader, uint256 valueUsdc)",
};

const LABELS = {
	tradingFees: "Trading Fees",
	executionFees: "Order Execution Fees",
	tradingFeesToProtocol: "Trading Fees To Protocol",
	tradingFeesToVault: "Trading Fees To Vault",
	executionFeesToKeepers: "Order Execution Fees To Keepers",
};

const fetch = async (options: FetchOptions) => {
	const { collateral, callbacks, noFeePairs = [] } = chainConfig[options.chain];
	const targets = callbacks
		.filter(({ from = 0, to = Infinity }) => options.fromTimestamp < to && options.toTimestamp > from)
		.map(({ address }) => address);

	// one event at a time: the public World Chain RPCs rate limit parallel getLogs
	const logs: Record<string, any[]> = {};
	for (const [key, eventAbi] of Object.entries(EVENTS)) logs[key] = await options.getLogs({ targets, eventAbi });

	const dailyVolume = options.createBalances();
	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();
	const dailySupplySideRevenue = options.createBalances();

	// notional = collateral x leverage (leverage is a plain integer multiplier), counted on opens and closes
	for (const log of [...logs.marketExecuted, ...logs.limitExecuted]) {
		if (noFeePairs.includes(Number(log.t.pairIndex))) continue;
		dailyVolume.add(collateral, BigInt(log.positionSizeUsdc) * BigInt(log.t.leverage));
	}

	for (const log of [...logs.devGovFee, ...logs.devGovFeeV2]) {
		dailyFees.add(collateral, log.valueUsdc, LABELS.tradingFees);
		dailyRevenue.add(collateral, log.valueUsdc, LABELS.tradingFeesToProtocol);
	}
	for (const log of logs.vaultFee) {
		dailyFees.add(collateral, log.valueUsdc, LABELS.tradingFees);
		dailySupplySideRevenue.add(collateral, log.valueUsdc, LABELS.tradingFeesToVault);
	}
	for (const log of logs.botFee) {
		dailyFees.add(collateral, log.valueUsdc, LABELS.executionFees);
		dailySupplySideRevenue.add(collateral, log.valueUsdc, LABELS.executionFeesToKeepers);
	}

	return {
		dailyVolume,
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue.clone(),
		dailySupplySideRevenue,
	};
};

const methodology = {
	Volume: "Notional size (collateral times leverage) of every perpetual position opened or closed, including limit, stop and liquidation fills. Excludes the BNB Chain pairs that charge no trading fee.",
	Fees: "Opening and closing fees paid by traders, plus the execution fee paid on limit, stop and liquidation orders.",
	Revenue: "The governance and development share of opening and closing fees, kept by Holdstation.",
	ProtocolRevenue: "The governance and development share of opening and closing fees, sent to Holdstation's dev and gov addresses.",
	SupplySideRevenue: "The closing fee sent to the vault that takes the other side of trades (WLD on World Chain, USD1 on BNB Chain), plus the execution fee paid to the bots that trigger limit, stop and liquidation orders.",
};

const breakdownMethodology = {
	Fees: {
		[LABELS.tradingFees]: "Opening and closing fees charged on perpetual trades (also charged when a market order is cancelled).",
		[LABELS.executionFees]: "Fee charged on limit, stop and liquidation orders for triggering them.",
	},
	Revenue: {
		[LABELS.tradingFeesToProtocol]: "Share of opening and closing fees credited to Holdstation's dev and gov addresses.",
	},
	ProtocolRevenue: {
		[LABELS.tradingFeesToProtocol]: "Share of opening and closing fees credited to Holdstation's dev and gov addresses.",
	},
	SupplySideRevenue: {
		[LABELS.tradingFeesToVault]: "Closing fee sent to the vault that takes the other side of trades.",
		[LABELS.executionFeesToKeepers]: "Execution fee paid to the bot that triggers a limit, stop or liquidation order.",
	},
};

const adapter: SimpleAdapter = {
	version: 2,
	pullHourly: true,
	fetch,
	adapter: chainConfig,
	methodology,
	breakdownMethodology,
};

export default adapter;
