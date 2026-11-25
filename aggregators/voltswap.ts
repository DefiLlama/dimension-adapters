import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const GQL_URL = "https://graphql.mainnet.sui.io/graphql";
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

interface GqlResponse {
  data?: {
    transactions?: {
      pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
      nodes: TxNode[];
    };
  };
}

const QUERY = `
  query ($addr: SuiAddress!, $before: String) {
    transactions(last: 50, before: $before, filter: { affectedAddress: $addr }) {
      pageInfo {
        hasPreviousPage
        startCursor
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

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const fromMs = options.fromTimestamp * 1000;
  const toMs = options.toTimestamp * 1000;

  let before: string | null = null;
  let pages = 0;

  while (pages < 20) {
    pages++;
    const res: GqlResponse = await httpPost(GQL_URL, {
      query: QUERY,
      variables: { addr: FEE_RECEIVER, before },
    });

    const page = res?.data?.transactions;
    if (!page || page.nodes.length === 0) break;

    let reachedBeforeWindow = false;

    for (let i = page.nodes.length - 1; i >= 0; i--) {
      const tx = page.nodes[i];
      const e = tx.effects;
      if (!e || e.status !== "SUCCESS") continue;
      const t = Date.parse(e.timestamp ?? "");
      if (!Number.isFinite(t)) continue;
      if (t >= toMs) continue;
      if (t < fromMs) {
        reachedBeforeWindow = true;
        continue;
      }

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
        dailyFees.add(coin, (fee + refFee).toString());
        dailyRevenue.add(coin, fee.toString());
        break;
      }
    }

    if (reachedBeforeWindow || !page.pageInfo.hasPreviousPage || !page.pageInfo.startCursor) {
      break;
    }
    before = page.pageInfo.startCursor;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
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
  },
};

export default adapter;
