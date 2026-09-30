import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds, LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { DefaultDexTokensBlacklisted } from "../../helpers/lists";
import { FeesForwardedEvent, getFeeForwarders, getFeeTransactions, isJumperTransaction, JumperFeeStart } from "../lifi/feeSources";

const SwapFee = 'Swap Fees';
const BridgeFee = 'Bridge Fees';

const fetch = (category: 'swap' | 'bridge') => async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
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
    for (const fee of log.args.fees) dailyFees.add(token, fee.amount, label);
  }

  return { dailyFees, dailyRevenue: dailyFees.clone(), dailyProtocolRevenue: dailyFees.clone() };
};

export const createJumperFeeAdapter = (category: 'swap' | 'bridge'): SimpleAdapter => {
  const label = category === 'bridge' ? BridgeFee : SwapFee;
  const product = category === 'bridge' ? 'bridges' : 'swaps';
  return {
  version: 2,
  pullHourly: true,
  fetch: fetch(category),
  adapter: Object.fromEntries(Object.keys(LifiFeeCollectors)
    .filter((chain) => /^0x[0-9a-f]{40}$/i.test(LifiDiamonds[chain]?.id ?? ''))
    .map((chain) => [chain, { start: JumperFeeStart }])),
  methodology: {
    Fees: `Jumper platform fees (0-5 bps depending on the assets) paid by users on ${product}.`,
    Revenue: 'All platform fees are kept by Jumper.',
    ProtocolRevenue: 'All platform fees are kept by Jumper.',
  },
  breakdownMethodology: {
    Fees: {
      [label]: `Jumper platform fees on ${product}.`,
    },
    Revenue: {
      [label]: `Jumper platform fees on ${product}.`,
    },
    ProtocolRevenue: {
      [label]: `Jumper platform fees on ${product}.`,
    },
  },
  };
};

export default createJumperFeeAdapter('swap');
