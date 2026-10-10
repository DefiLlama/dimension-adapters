import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Cashmere (CCTP relayer plus LayerZero USDT0 and NEAR Intents routes), from Cashmere's own transaction API.
// Each transfer has a source and destination domain; the source chain gets the outgoing leg (deposit_amount) and the
// destination chain the incoming leg (receive_amount). Amounts are 6-decimal: stablecoin units on stablecoin routes,
// USD on NEAR Intents native-asset routes (600xxx domains), e.g. Base ETH -> Ethereum USDC reports 3.81 in / 3.51 out.
// Domain ids from bridges-server's Cashmere adapter (src/adapters/cashmere/types.ts).
const API = "https://kapi.cashmere.exchange/transactionsmainnet";
const USDC = "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const USDT = "ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7";

const domainToChain: Record<number, string> = {
  // Circle CCTP domains (USDC)
  0: CHAIN.ETHEREUM, 1: CHAIN.AVAX, 2: CHAIN.OPTIMISM, 3: CHAIN.ARBITRUM, 5: CHAIN.SOLANA, 6: CHAIN.BASE, 7: CHAIN.POLYGON,
  8: CHAIN.SUI, 9: CHAIN.APTOS, 10: CHAIN.UNICHAIN, 11: CHAIN.LINEA, 13: CHAIN.SONIC, 14: CHAIN.WC,
  15: CHAIN.MONAD, // Circle's CCTP domain for Monad, missing from the old adapter
  16: CHAIN.SEI, 19: CHAIN.HYPERLIQUID,
  // LayerZero endpoint ids (USDT0)
  30101: CHAIN.ETHEREUM, 30106: CHAIN.AVAX, 30109: CHAIN.POLYGON, 30110: CHAIN.ARBITRUM, 30111: CHAIN.OPTIMISM, 30184: CHAIN.BASE,
  30320: CHAIN.UNICHAIN, 30183: CHAIN.LINEA, 30319: CHAIN.WC, 30280: CHAIN.SEI, 30332: CHAIN.SONIC, 30367: CHAIN.HYPERLIQUID,
  30362: CHAIN.BERACHAIN, 30339: CHAIN.INK, 30331: CHAIN.CORN, 30295: CHAIN.FLARE, 30333: CHAIN.ROOTSTOCK, 30274: CHAIN.XLAYER,
  30383: CHAIN.PLASMA,
  // NEAR Intents stablecoins: 500_0X1 = USDC, 500_0X2 = USDT
  500_011: CHAIN.ETHEREUM, 500_012: CHAIN.ETHEREUM, 500_021: CHAIN.ARBITRUM, 500_022: CHAIN.ARBITRUM, 500_031: CHAIN.POLYGON,
  500_032: CHAIN.POLYGON, 500_041: CHAIN.OPTIMISM, 500_042: CHAIN.OPTIMISM, 500_051: CHAIN.AVAX, 500_052: CHAIN.AVAX,
  500_061: CHAIN.BASE, 500_071: CHAIN.SOLANA, 500_072: CHAIN.SOLANA, 500_081: CHAIN.BSC, 500_082: CHAIN.BSC, 500_101: CHAIN.XLAYER,
  500_102: CHAIN.XLAYER, 500_111: CHAIN.MONAD, 500_112: CHAIN.MONAD, 500_122: CHAIN.PLASMA, 500_132: CHAIN.BERACHAIN,
  500_201: CHAIN.SUI, 500_302: CHAIN.APTOS, 500_401: CHAIN.NEAR, 500_402: CHAIN.NEAR, 500_501: CHAIN.STELLAR, 500_602: CHAIN.TON,
  500_702: CHAIN.TRON,
  // NEAR Intents native assets (amounts in USD)
  600_010: CHAIN.ETHEREUM, 600_020: CHAIN.ARBITRUM, 600_030: CHAIN.POLYGON, 600_040: CHAIN.OPTIMISM, 600_050: CHAIN.AVAX,
  600_060: CHAIN.BASE, 600_080: CHAIN.BSC, 600_100: CHAIN.XLAYER, 600_110: CHAIN.MONAD, 600_120: CHAIN.PLASMA,
  600_140: CHAIN.BERACHAIN, 600_200: CHAIN.SOLANA, 600_300: CHAIN.SUI, 600_400: CHAIN.APTOS,
};

type CashmereTx = {
  source_domain?: number; destination_domain?: number; deposit_amount?: number; receive_amount?: number;
  source_tx_hash?: string; destination_tx_hash?: string; destination_tx_status?: string; has_source_tx_error: boolean; created_at: string;
};

// one paged pull per window, shared by every chain
const prefetch = async (options: FetchOptions): Promise<CashmereTx[]> => {
  const rows: CashmereTx[] = [];
  let cursor: string | undefined;
  do {
    const page = await httpGet(`${API}?start_time=${options.startTimestamp}&end_time=${options.endTimestamp}&limit=50${cursor ? `&cursor=${cursor}` : ""}`);
    if (!Array.isArray(page?.transactions)) throw new Error("cashmere: unexpected API response");
    rows.push(...page.transactions);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  // half-open window on the creation time, both legs are dated by it
  return rows.filter((tx) => {
    const ts = Date.parse(tx.created_at) / 1000;
    return ts >= options.startTimestamp && ts < options.endTimestamp;
  });
};

// stablecoin legs are priced as the stablecoin, native-asset legs carry the API's USD value
const addLeg = (balances: any, domain: number, amount: number) => {
  if (domain >= 600_000) return balances.addUSDValue(amount / 1e6);
  const isUsdt = (domain >= 30_000 && domain < 500_000) || (domain >= 500_000 && domain % 2 === 0);
  balances.add(isUsdt ? USDT : USDC, amount, { skipChain: true });
};

const fetch = async (options: FetchOptions) => {
  const txs: CashmereTx[] = options.preFetchedResults;
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const tx of txs) {
    const src = tx.source_domain, dst = tx.destination_domain;
    if (src !== undefined && domainToChain[src] === options.chain && tx.source_tx_hash && !tx.has_source_tx_error && (tx.deposit_amount ?? 0) > 0) {
      addLeg(dailyOutgoingVolume, src, tx.deposit_amount!);
      dailyOutgoingTxCount++;
    }
    if (dst !== undefined && domainToChain[dst] === options.chain && tx.destination_tx_hash && tx.destination_tx_status === "success" && (tx.receive_amount ?? 0) > 0) {
      addLeg(dailyIncomingVolume, dst, tx.receive_amount!);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(domainToChain))],
  start: "2025-09-20", // first day the old bridges server recorded Cashmere volume
  methodology: {
    OutgoingVolume: "Value of transfers sent from each chain through Cashmere, as reported by Cashmere's transaction API; stablecoin routes are priced as the stablecoin, native-asset routes use the API's USD value.",
    IncomingVolume: "Value of transfers delivered to each chain through Cashmere, as reported by Cashmere's transaction API; stablecoin routes are priced as the stablecoin, native-asset routes use the API's USD value.",
    OutgoingTxCount: "Number of Cashmere transfers sent from each chain.",
    IncomingTxCount: "Number of Cashmere transfers delivered to each chain.",
  },
};

export default adapter;
