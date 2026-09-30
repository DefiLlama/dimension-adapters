import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists";
import { FeesForwardedEvent, getFeeForwarders, getFeeTransactions, isJumperTransaction, JumperFeeStart, LifiRecipient } from "../lifi/feeSources";

const SwapFee = 'Swap Fees';
const BridgeFee = 'Bridge Fees';

const fetch = async (options: FetchOptions) => {
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
    if (!isJumperTransaction(transaction)) continue;
    const token = String(log.args.token);
    if (blacklist.has(token.toLowerCase())) continue;
    const label = transaction.kind === 'bridge' ? BridgeFee : SwapFee;
    for (const fee of log.args.fees) {
      dailyFees.add(token, fee.amount, label);
      (String(fee.recipient).toLowerCase() === LifiRecipient ? dailyRevenue : dailySupplySideRevenue).add(token, fee.amount, label);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: Object.fromEntries(Object.keys(LifiFeeCollectors)
    .filter((chain) => /^0x[0-9a-f]{40}$/i.test(LifiDiamonds[chain]?.id ?? ''))
    .map((chain) => [chain, { start: JumperFeeStart }])),
  methodology: {
    Fees: 'Jumper platform fees on LI.FI-routed transactions whose diamond event identifies jumper.exchange or jumper.exchange.gas; excludes unrelated LI.FI traffic and network/provider costs.',
    Revenue: 'The Jumper-attributed fee leg sent to the LI.FI fee recipient. On-chain payout destination is LI.FI; this is attributed to Jumper by the transaction integrator.',
    ProtocolRevenue: 'The Jumper-attributed fee leg sent to the LI.FI fee recipient.',
    SupplySideRevenue: 'Any other recipients of Jumper-attributed fee payouts.',
  },
  breakdownMethodology: {
    Fees: {
      [SwapFee]: 'FeesForwarded payouts on Jumper same-chain swaps.',
      [BridgeFee]: 'FeesForwarded payouts on Jumper bridges, including source swaps.',
    },
    Revenue: {
      [SwapFee]: 'Jumper swap fee leg sent to the LI.FI fee recipient.',
      [BridgeFee]: 'Jumper bridge fee leg sent to the LI.FI fee recipient.',
    },
    ProtocolRevenue: {
      [SwapFee]: 'Jumper swap fee leg sent to the LI.FI fee recipient.',
      [BridgeFee]: 'Jumper bridge fee leg sent to the LI.FI fee recipient.',
    },
    SupplySideRevenue: {
      [SwapFee]: 'Jumper swap fee legs sent to other recipients.',
      [BridgeFee]: 'Jumper bridge fee legs sent to other recipients.',
    },
  },
};

export default adapter;
