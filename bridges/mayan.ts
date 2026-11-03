import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Mayan cross-chain swaps (Swift, MCTP, Wormhole and HyperCore routes), from Mayan's explorer API (the source the old bridges
// server used). The explorer has no time filter and pages at most 3000 swaps back per query, so it only reaches the last hours.
// The source chain gets the outgoing leg and the destination chain the incoming leg, both valued with the source token and raw
// amount (the destination amount is only known once filled). Same-chain swaps and refunded or failed orders are skipped; swaps
// still in flight are counted, since nearly all settle within minutes and the hour is not read again. HyperCore withdrawals
// still at HC_INITIATED_ON_HYPERCORE are skipped: that is a signed request Mayan received but HyperCore never executed, and
// unexecuted requests stay there for weeks with test amounts (1e24 USDC from the Anvil default account on 2026-10-29).
const API = "https://explorer-api.mayan.finance/v3/swaps";
const PAGE_SIZE = 100;
const MAX_OFFSET = 3000; // the explorer rejects larger offsets
const MAX_LOOKBACK = 12 * 3600; // how far back the busiest chains stay within MAX_OFFSET (Solana: ~100 swaps per 30 min)

// Wormhole chain id -> explorer `fromChain` name and DefiLlama chain; Aptos is retired
const CHAINS: Record<string, { name: string; chain: string }> = {
  "1": { name: "solana", chain: CHAIN.SOLANA },
  "2": { name: "ethereum", chain: CHAIN.ETHEREUM },
  "4": { name: "bsc", chain: CHAIN.BSC },
  "5": { name: "polygon", chain: CHAIN.POLYGON },
  "6": { name: "avalanche", chain: CHAIN.AVAX },
  "21": { name: "sui", chain: CHAIN.SUI },
  "23": { name: "arbitrum", chain: CHAIN.ARBITRUM },
  "24": { name: "optimism", chain: CHAIN.OPTIMISM },
  "30": { name: "base", chain: CHAIN.BASE },
  "38": { name: "linea", chain: CHAIN.LINEA },
  "44": { name: "unichain", chain: CHAIN.UNICHAIN },
  "47": { name: "hyperevm", chain: CHAIN.HYPERLIQUID },
  "48": { name: "monad", chain: CHAIN.MONAD },
  "65000": { name: "hypercore", chain: CHAIN.HYPERLIQUID }, // HyperCore, booked with HyperEVM under hyperliquid
};
const HYPERCORE = "65000"; // HyperCore token amounts are not chain-priceable, the explorer's USD price is used
// Sui MCTP bridges report fromAmount64 in the pre-swap input token (100 SUI = 100e9 booked as 100k USDC), so the explorer's
// USD price on the bridged amount is used instead; other chains' fromAmount64 matches fromTokenAddress
const SUI = "21";
const NATIVE = ADDRESSES.null; // native token on every chain, SOL included
const WSOL = ADDRESSES.solana.SOL;
const SKIPPED_STATUS = /REFUND|FAIL|EXPIRE|CANCEL|^HC_INITIATED_ON_HYPERCORE$/;

type Swap = {
  id: string; service: string; status: string; initiatedAt: string; sourceChain: string; destChain: string;
  fromTokenAddress: string; fromAmount: string; fromAmount64: string; fromTokenPrice: number | null;
};

// swaps from one source chain initiated in [from, to), newest first until the window start is passed
const getChainSwaps = async (name: string, from: number, to: number): Promise<Swap[]> => {
  const swaps: Swap[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (offset >= MAX_OFFSET) throw new Error(`mayan: ${name} needs more than ${MAX_OFFSET} swaps to reach ${new Date(from * 1000).toISOString()}`);
    const page: Swap[] = (await httpGet(`${API}?format=raw&fromChain=${name}&limit=${PAGE_SIZE}&offset=${offset}`)).data;
    if (!Array.isArray(page)) throw new Error("mayan: unexpected API response");
    for (const s of page) {
      const ts = Date.parse(s.initiatedAt) / 1000;
      if (ts >= from && ts < to) swaps.push(s);
    }
    if (page.length < PAGE_SIZE || Date.parse(page[page.length - 1].initiatedAt) / 1000 < from) return swaps;
  }
};

// one pull per window, shared by every chain
const prefetch = async (options: FetchOptions): Promise<Swap[]> => {
  if (options.startTimestamp < Date.now() / 1000 - MAX_LOOKBACK)
    throw new Error(`mayan: the explorer only reaches the last ${MAX_LOOKBACK / 3600} hours, ${new Date(options.startTimestamp * 1000).toISOString()} cannot be pulled`);
  const swaps: Swap[] = [];
  for (const { name } of Object.values(CHAINS)) swaps.push(...(await getChainSwaps(name, options.startTimestamp, options.endTimestamp)));
  return swaps.filter((s) => {
    const source = CHAINS[s.sourceChain]?.chain;
    const dest = CHAINS[s.destChain]?.chain;
    return s.service !== "MONO_CHAIN" && !SKIPPED_STATUS.test(s.status) && source !== dest;
  });
};

const addSourceValue = (balances: any, s: Swap) => {
  if (s.sourceChain === HYPERCORE || s.sourceChain === SUI) return balances.addUSDValue(Number(s.fromAmount) * (s.fromTokenPrice ?? 0));
  const chain = CHAINS[s.sourceChain].chain;
  const token = chain === CHAIN.SOLANA && s.fromTokenAddress === NATIVE ? WSOL : s.fromTokenAddress;
  balances.add(`${chain}:${token}`, s.fromAmount64, { skipChain: true });
};

const fetch = async (options: FetchOptions) => {
  const swaps: Swap[] = options.preFetchedResults;
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const s of swaps) {
    if (CHAINS[s.sourceChain]?.chain === options.chain) {
      addSourceValue(dailyOutgoingVolume, s);
      dailyOutgoingTxCount++;
    }
    if (CHAINS[s.destChain]?.chain === options.chain) {
      addSourceValue(dailyIncomingVolume, s);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(CHAINS).map((c) => c.chain))],
  methodology: {
    OutgoingVolume: "Value of tokens sent from each chain through Mayan cross-chain swaps, priced from the source token and amount; same-chain swaps and refunded orders excluded.",
    IncomingVolume: "Value of Mayan cross-chain swaps delivered to each chain, priced from the source token and amount; same-chain swaps and refunded orders excluded.",
    OutgoingTxCount: "Number of Mayan cross-chain swaps sent from each chain.",
    IncomingTxCount: "Number of Mayan cross-chain swaps delivered to each chain.",
  },
};

export default adapter;
