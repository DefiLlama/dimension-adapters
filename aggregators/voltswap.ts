import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getCheckpointBeforeWindow, graphqlCall } from "../helpers/sui";

const REFERRAL_FEES = "Referral Fees";

const FEE_RECEIVER = "0x7211d7a33c32b8a848fd5d87dc0630b7d40d3d324856a748aff454c2955cab12";
const SUI_FULL = "0x" + "0".repeat(63) + "2::sui::SUI";

const normCoin = (coin: string): string => {
  const lower = coin.toLowerCase();
  if (lower === SUI_FULL || lower === "0x2::sui::sui") return "0x2::sui::SUI";
  return coin;
};

interface BalanceChangeNode {
  owner: { address: string } | null;
  amount: string;
  coinType: { repr: string };
}

interface TxNode {
  digest: string;
  sender: { address: string } | null;
  effects: {
    timestamp: string | null;
    status: string;
    balanceChanges: { nodes: BalanceChangeNode[] };
  } | null;
}

const txsQuery = (afterCheckpoint: number) => `
  query ($addr: SuiAddress!, $after: String) {
    transactions(first: 50, after: $after, filter: { affectedAddress: $addr, afterCheckpoint: ${afterCheckpoint} }) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        digest
        sender { address }
        effects {
          timestamp
          status
          balanceChanges(first: 50) {
            nodes {
              owner { address }
              amount
              coinType { repr }
            }
          }
        }
      }
    }
  }
`;

const getFeeReceiverTxsInWindow = async (options: FetchOptions): Promise<TxNode[]> => {
  const { sequenceNumber } = await getCheckpointBeforeWindow(options.startTimestamp);
  const query = txsQuery(sequenceNumber);
  const txs: TxNode[] = [];
  let after: string | null = null;
  while (true) {
    const { transactions: page } = await graphqlCall(query, { addr: FEE_RECEIVER, after });
    for (const tx of page.nodes as TxNode[]) {
      const timestamp = Date.parse(tx.effects?.timestamp ?? "") / 1e3;
      if (timestamp >= options.endTimestamp) return txs;
      if (timestamp >= options.startTimestamp) txs.push(tx);
    }
    if (!page.pageInfo.hasNextPage) return txs;
    after = page.pageInfo.endCursor;
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const tx of await getFeeReceiverTxsInWindow(options)) {
    const e = tx.effects;
    if (!e || e.status !== "SUCCESS") continue;

    const sender = tx.sender?.address?.toLowerCase();
    if (!sender || sender === FEE_RECEIVER) continue;

    const mine = new Map<string, bigint>();
    const theirs = new Map<string, bigint>();
    const others = new Map<string, Map<string, bigint>>();

    for (const b of e.balanceChanges?.nodes ?? []) {
      const owner = b.owner?.address?.toLowerCase();
      if (!owner) continue;
      const coin = normCoin(b.coinType.repr);
      const amt = BigInt(b.amount);
      if (owner === FEE_RECEIVER) {
        mine.set(coin, (mine.get(coin) ?? 0n) + amt);
      } else if (owner === sender) {
        theirs.set(coin, (theirs.get(coin) ?? 0n) + amt);
      } else {
        const m = others.get(coin) ?? new Map<string, bigint>();
        m.set(owner, (m.get(owner) ?? 0n) + amt);
        others.set(coin, m);
      }
    }

    const hasGain = [...theirs.values()].some((v) => v > 0n);
    const hasLoss = [...theirs.values()].some((v) => v < 0n);
    if (!hasGain || !hasLoss) continue;

    for (const [coin, fee] of mine) {
      if (fee <= 0n) continue;
      const senderDelta = theirs.get(coin) ?? 0n;
      const volume = senderDelta > 0n ? senderDelta + fee : senderDelta < 0n ? -senderDelta : 0n;
      if (volume <= 0n) continue;

      const rate = Number(fee) / Number(volume);
      if (rate < 0.00002 || rate > 0.01) continue;

      let refFee = 0n;
      const coinOthers = others.get(coin);
      if (coinOthers) {
        for (const [, amt] of coinOthers) {
          if (amt > 0n && amt * 100n >= fee * 20n && amt * 100n <= fee * 260n) {
            refFee = amt;
            break;
          }
        }
      }

      dailyVolume.add(coin, volume.toString());
      dailyFees.add(coin, fee.toString(), METRIC.SWAP_FEES);
      dailyRevenue.add(coin, fee.toString(), METRIC.SWAP_FEES);
      if (refFee > 0n) {
        dailyFees.add(coin, refFee.toString(), REFERRAL_FEES);
        dailySupplySideRevenue.add(coin, refFee.toString(), REFERRAL_FEES);
      }
      break;
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2026-11-20",
    },
  },
  methodology: {
    Volume: "Total USD value of swaps routed through Voltswap on Sui, derived from on-chain swap transactions paying protocol fees to the Voltswap fee receiver.",
    Fees: "0.1% aggregator fee collected on swaps routed through Voltswap.",
    Revenue: "Portion of swap fees retained by Voltswap treasury (excluding atomic partner referral splits).",
    ProtocolRevenue: "Portion of swap fees retained by Voltswap treasury (excluding atomic partner referral splits).",
    SupplySideRevenue: "Partner referral share of swap fees, paid out in the same swap transaction.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "0.1% aggregator fee paid to the Voltswap fee receiver on routed swaps.",
      [REFERRAL_FEES]: "Partner referral share of the swap fee, paid to the partner in the same transaction.",
    },
    Revenue: {
      [METRIC.SWAP_FEES]: "0.1% aggregator fee paid to the Voltswap fee receiver on routed swaps.",
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: "0.1% aggregator fee paid to the Voltswap fee receiver on routed swaps.",
    },
    SupplySideRevenue: {
      [REFERRAL_FEES]: "Partner referral share of the swap fee, paid to the partner in the same transaction.",
    },
  },
};

export default adapter;
