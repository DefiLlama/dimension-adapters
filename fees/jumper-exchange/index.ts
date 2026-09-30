import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists";
import { FeesForwardedEvent, getFeeForwarders, getFeeTransactions, isJumperTransaction, JumperFeeStart, LifiRecipient } from "../lifi/feeSources";

const SwapFee = 'Swap Fees';
const BridgeFee = 'Bridge Fees';

const fetch = (category: 'swap' | 'bridge') => async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const blacklist = new Set((DefaultDexTokensBlacklisted[options.chain] ?? []).map((token) => token.toLowerCase()));
  const forwarded: any[] = await options.getLogs({
    targets: getFeeForwarders(options.chain),
    eventAbi: FeesForwardedEvent,
    entireLog: true,
  });
  const transactions = forwarded.length ? await getFeeTransactions(options) : new Map();

  for (const log of forwarded) {
    const transaction = transactions.get(String(log.transactionHash).toLowerCase());
    if (!isJumperTransaction(transaction) || transaction.kind !== category) continue;
    const token = String(log.args.token);
    if (blacklist.has(token.toLowerCase())) continue;
    const label = category === 'bridge' ? BridgeFee : SwapFee;
    for (const fee of log.args.fees) {
      dailyFees.add(token, fee.amount, label);
      (String(fee.recipient).toLowerCase() === LifiRecipient ? dailyRevenue : dailySupplySideRevenue).add(token, fee.amount, label);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

export const createJumperFeeAdapter = (category: 'swap' | 'bridge'): SimpleAdapter => {
  const label = category === 'bridge' ? BridgeFee : SwapFee;
  const product = category === 'bridge' ? 'bridges (including source swaps)' : 'same-chain swaps';
  return {
  version: 2,
  pullHourly: true,
  fetch: fetch(category),
  adapter: Object.fromEntries(Object.keys(LifiFeeCollectors)
    .filter((chain) => /^0x[0-9a-f]{40}$/i.test(LifiDiamonds[chain]?.id ?? ''))
    .map((chain) => [chain, { start: JumperFeeStart }])),
  methodology: {
    Fees: `Jumper platform fees on LI.FI-routed ${product} whose diamond event identifies jumper.exchange or jumper.exchange.gas; excludes unrelated LI.FI traffic and network/provider costs.`,
    Revenue: 'The Jumper-attributed fee leg sent to the LI.FI fee recipient. On-chain payout destination is LI.FI; this is attributed to Jumper by the transaction integrator.',
    ProtocolRevenue: 'The Jumper-attributed fee leg sent to the LI.FI fee recipient.',
    SupplySideRevenue: 'Any other recipients of Jumper-attributed fee payouts.',
  },
  breakdownMethodology: {
    Fees: {
      [label]: `FeesForwarded payouts on Jumper ${product}.`,
    },
    Revenue: {
      [label]: 'Jumper fee leg sent to the LI.FI fee recipient.',
    },
    ProtocolRevenue: {
      [label]: 'Jumper fee leg sent to the LI.FI fee recipient.',
    },
    SupplySideRevenue: {
      [label]: 'Jumper fee legs sent to other recipients.',
    },
  },
  };
};

export default createJumperFeeAdapter('swap');
