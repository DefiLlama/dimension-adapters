import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const LAUNCH_FEE = 0.00069; // 0.00069 ETH for each token created
const config: any = {
	[CHAIN.UNICHAIN]: {
		poolManager: "0x1f98400000000000000000000000000000000004",
		uniderpLauncher: "0xb42B41140d921b621246016eC0ecb8dbE3216948",
		uniderpHook: "0xcc2efb167503f2d7df0eae906600066aec9e8444",
		start: "2025-05-29",
		fromBlock: 17670688
	},
}

const MetricLaunchCoinsFee = 'Launch Coins Fee'
const MetricCreatorReward = 'Creator Rewards'
const MetricTradeReferrer = 'Trade Referrer'
const MetricProtocolReward = 'Protocol Rewards'

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
	const { createBalances } = options;

	const dailyFees = createBalances();
	const dailySupplySideRevenue = createBalances();
	const dailyProtocolRevenue = createBalances();

	const logs = await options.getLogs({
		target: config[options.chain].uniderpLauncher,
		topic: '0x9ca864710db9ed6fc7248cb9a7c01b6a001862f1425e0c9d1fbe55074c01c322',
	})

	dailyFees.addGasToken(logs.length * LAUNCH_FEE, MetricLaunchCoinsFee)

	const events = await options.getLogs({
		target: config[options.chain].uniderpHook,
		eventAbi:'event FeeTaken (uint8 indexed feeType, address indexed token, address indexed receiver, uint256 amount)',
	})
	for (const event of events) {
		dailyFees.add(event.token, event.amount, '')
		if (Number(event.feeType) === 0) {
			// platform fees
			dailyFees.add(event.token, Number(event.amount) * 0.51, MetricProtocolReward)
			dailyFees.add(event.token, Number(event.amount) * 0.49, METRIC.TRADING_FEES)
			dailyProtocolRevenue.add(event.token, Number(event.amount) * 0.51, MetricProtocolReward)
			dailySupplySideRevenue.add(event.token, Number(event.amount) * 0.49, METRIC.TRADING_FEES)
		} else if (Number(event.feeType) === 1) {
			// creator
			dailyFees.add(event.token, event.amount, MetricCreatorReward)
			dailySupplySideRevenue.add(event.token, event.amount, MetricCreatorReward)
		} else if (Number(event.feeType) === 1) {
			// refferal
			dailyFees.add(event.token, event.amount, MetricTradeReferrer)
			dailySupplySideRevenue.add(event.token, event.amount, MetricTradeReferrer)
		}
	}

	return {
		dailyFees,
		dailyRevenue: dailyProtocolRevenue,
		dailyUserFees: dailyFees,
		dailyProtocolRevenue,
		dailySupplySideRevenue
	};
}

const methodology = {
	UserFees: "User pays 1.01% fees on each swap.",
	Fees: "All fees comes from the user. User pays 1.01% fees on each swap.",
	Revenue: "Treasury receives 0.51% of each swap. (0.5% from swap + 0.01% from LPs) + Launch Fees (0.00069 ETH for each token created)",
	ProtocolRevenue: "Treasury receives 0.51% of each swap. (0.5% from swap + 0.01% from LPs) + Launch Fees (0.00069 ETH for each token created)",
	SupplySideRevenue: "Fees distributed to coin creators and trading referrer.",
}

const breakdownMethodology = {
  Fees: {
		[METRIC.TRADING_FEES]: 'Trading fees paid by users.',
    [MetricCreatorReward]: 'Fees are distributed to coin creators.',
    [MetricLaunchCoinsFee]: 'Fixed 0.00069 ETH fee when launching coins.',
    [MetricTradeReferrer]: 'Fees are collected by trading referrer.',
    [MetricProtocolReward]: 'Fees are collected by Zora protocol.',
  },
  UserFees: {
		[METRIC.TRADING_FEES]: 'Trading fees paid by users.',
    [MetricCreatorReward]: 'Fees are distributed to coin creators.',
    [MetricLaunchCoinsFee]: 'Fixed 0.00069 ETH fee when launching coins.',
    [MetricTradeReferrer]: 'Fees are collected by trading referrer.',
    [MetricProtocolReward]: 'Fees are collected by Zora protocol.',
  },
  Revenue: {
		[METRIC.TRADING_FEES]: 'Share of 51% trading fees paid by users.',
    [MetricLaunchCoinsFee]: 'Fixed 0.00069 ETH fee when launching coins.',
  },
  ProtocolRevenue: {
		[METRIC.TRADING_FEES]: 'Share of 51% trading fees paid by users.',
    [MetricLaunchCoinsFee]: 'Fixed 0.00069 ETH fee when launching coins.',
  },
  SupplySideRevenue: {
		[METRIC.TRADING_FEES]: 'Share of 49% trading fees paid by users.',
		[MetricCreatorReward]: 'Fees are distributed to coin creators.',
		[MetricTradeReferrer]: 'Fees are collected by trading referrer.',
  },
}

const adapter: SimpleAdapter = {
	version: 2,
	adapter: Object.keys(config).reduce((acc, chain) => {
		const { start } = config[chain];
		(acc as any)[chain] = {
			fetch,
			start: start,
		};
		return acc;
	}, {}),
	methodology,
	breakdownMethodology,
};

export default adapter;