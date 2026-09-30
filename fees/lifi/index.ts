import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists"
import { FeeCollectedEvent, FeesForwardedEvent, getFeeForwarders, getFeeTransactions, isJumperTransaction, JumperFeeStart, LifiRecipient } from './feeSources'

const IntegratorFee = 'Integration & Partnership Fees'
const LifiProtocolFee = 'LiFi Fees'
const SwapFee = 'Swap Fees'
const BridgeFee = 'Bridge Fees'
const OtherFee = 'Other Fees'

const fetch = (category: 'swap' | 'bridge') => async (options: FetchOptions) => {
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
		entireLog: true,
	});
	const forwarded: any[] = await options.getLogs({
		targets: getFeeForwarders(options.chain),
		eventAbi: FeesForwardedEvent,
		entireLog: true,
	});
	const transactions = legacy.length || forwarded.length ? await getFeeTransactions(options) : new Map();
	const sourceFor = (hash: string) => {
		const kind = transactions.get(hash.toLowerCase())?.kind;
		if (kind === category) return kind === 'bridge' ? BridgeFee : SwapFee;
		if (!kind && category === 'bridge') return OtherFee;
		return undefined;
	};
	legacy.forEach((log: any) => {
		const source = sourceFor(String(log.transactionHash));
		if (!source) return;
		addFee(log.args._token, log.args._integratorFee, false, source);
		addFee(log.args._token, log.args._lifiFee, true, source);
	});

	const separateJumper = options.startTimestamp >= Date.parse(JumperFeeStart) / 1000;
	forwarded.forEach((log: any) => {
		const hash = String(log.transactionHash);
		// Jumper is a separate integrator whose fee is paid into LI.FI's wallet as a single leg (2/5 bps,
		// no LI.FI cut): count it as integrator fee, not LI.FI revenue.
		const jumper = separateJumper && isJumperTransaction(transactions.get(hash.toLowerCase()));
		const source = sourceFor(hash);
		if (!source) return;
		log.args.fees.forEach((fee: any) => {
			addFee(log.args.token, fee.amount, !jumper && String(fee.recipient).toLowerCase() === LifiRecipient, source);
		});
	});

	return {
		dailyFees,
		dailyRevenue,
		dailyProtocolRevenue: dailyRevenue,
		dailySupplySideRevenue,
	};
};

export const createLifiFeeAdapter = (category: 'swap' | 'bridge'): SimpleAdapter => ({
	version: 2,
	pullHourly: false, // each run scans the LI.FI diamond for every swap/bridge event on 40+ chains; hourly pulls would 24x that load
	fetch: fetch(category),
	adapter: LifiFeeCollectors,
	methodology: {
		Fees: `All fees paid by users on LI.FI ${category === 'bridge' ? 'bridges' : 'swaps'}, including integrator fees.`,
		Revenue: 'Share of fees kept by LI.FI.',
		ProtocolRevenue: 'Share of fees kept by LI.FI.',
		SupplySideRevenue: 'Share of fees paid to integrators, including Jumper since 2026-09-24.',
	},
	breakdownMethodology: {
		Fees: {
			...(category === 'swap' ? { [SwapFee]: 'Fees on same-chain swaps.' } : {
				[BridgeFee]: 'Fees on bridges, including swaps before bridging.',
				[OtherFee]: 'Fees that could not be matched to a swap or a bridge.',
			}),
		},
		Revenue: {
			[LifiProtocolFee]: 'Share of fees kept by LI.FI.',
		},
		ProtocolRevenue: {
			[LifiProtocolFee]: 'Share of fees kept by LI.FI.',
		},
		SupplySideRevenue: {
			[IntegratorFee]: 'Share of fees paid to integrators, including Jumper since 2026-09-24.',
		},
	}
});

export default createLifiFeeAdapter('bridge');
