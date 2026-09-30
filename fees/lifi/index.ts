import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists"
import { FeeCollectedEvent, FeesForwardedEvent, getFeeForwarders, getFeeTransactions, isJumperTransaction, JumperFeeStart, LifiRecipient } from './feeSources'

const IntegratorFee = 'Integration & Partnership Fees'
const LifiProtocolFee = 'LiFi Fees'
const SwapFee = 'Swap Fees'
const BridgeFee = 'Bridge Fees'
const OtherFee = 'Other Fees'
const LegacyFee = 'Legacy Fees'

const fetch = async (options: FetchOptions) => {
	const dailyFees = options.createBalances();
	const dailyRevenue = options.createBalances();
	const dailySupplySideRevenue = options.createBalances();

	// 0x0000000000000000000000000000000000000000 is the gas token for all chains, we already handle it in the Balances
	const blacklistForChain = new Set(DefaultDexTokensBlacklisted[options.chain] ?? []);

	const addFee = (token: string, amount: any, isLifi: boolean, source: string) => {
		if (blacklistForChain.has(token.toLowerCase())) return;
		const label = isLifi ? LifiProtocolFee : IntegratorFee;
		dailyFees.add(token, amount, source);
		(isLifi ? dailyRevenue : dailySupplySideRevenue).add(token, amount, label);
	};

	const legacy: any[] = await options.getLogs({
		target: LifiFeeCollectors[options.chain].id,
		eventAbi: FeeCollectedEvent,
	});
	legacy.forEach((log: any) => {
		addFee(log._token, log._integratorFee, false, LegacyFee);
		addFee(log._token, log._lifiFee, true, LegacyFee);
	});

	const forwarded: any[] = await options.getLogs({
		targets: getFeeForwarders(options.chain),
		eventAbi: FeesForwardedEvent,
		entireLog: true,
	});
	const transactions = forwarded.length ? await getFeeTransactions(options) : new Map();
	const separateJumper = options.startTimestamp >= Date.parse(JumperFeeStart) / 1000;
	forwarded.forEach((log: any) => {
		const transaction = transactions.get(String(log.transactionHash).toLowerCase());
		if (separateJumper && isJumperTransaction(transaction)) return;
		const source = transaction?.kind === 'bridge' ? BridgeFee : transaction?.kind === 'swap' ? SwapFee : OtherFee;
		log.args.fees.forEach((fee: any) => {
			addFee(log.args.token, fee.amount, String(fee.recipient).toLowerCase() === LifiRecipient, source);
		});
	});

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
		dailySupplySideRevenue,
	};
};

const adapter: SimpleAdapter = {
	version: 2,
	// pullHourly: true,
	fetch,
	adapter: LifiFeeCollectors,
	methodology: {
		Fees: 'Fees paid by users on LI.FI-routed swaps and bridges, excluding Jumper platform fees from 2026-09-24 onward.',
		Revenue: 'Fees are collected by LI.FI protocol.',
		ProtocolRevenue: 'Fees are collected by LI.FI protocol.',
		SupplySideRevenue: 'Fees are distributed to LI.FI and intergations and partnerships.',
	},
	breakdownMethodology: {
		Fees: {
			[SwapFee]: 'FeesForwarded payouts on transactions with LI.FI swap events and no bridge event.',
			[BridgeFee]: 'FeesForwarded payouts on transactions with LI.FI bridge events, including source swaps.',
			[OtherFee]: 'FeesForwarded payouts with no matching LI.FI diamond event.',
			[LegacyFee]: 'Historical FeesCollected payouts before the fee-router migration.',
		},
		Revenue: {
			[LifiProtocolFee]: 'Fees share for LI.FI protocol.',
		},
		ProtocolRevenue: {
			[LifiProtocolFee]: 'Fees share for LI.FI protocol.',
		},
		SupplySideRevenue: {
			[IntegratorFee]: 'Fees are distributed to LI.FI and intergations and partnerships.',
		},
	}
};

export default adapter;
