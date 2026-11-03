import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

//https://wormhole.com/docs/products/reference/contract-addresses
const API = "https://api.wormholescan.io/api/v1/operations";
const PAGE_SIZE = 100; // the API's maximum

// Wormhole chain id -> DefiLlama chain. Ids from the Wormhole SDK, retired chains from the legacy @certusone/wormhole-sdk.
// Not tracked, no CHAIN key: creditcoin (59), wormchain (3104)
const chainMap: Record<string, string> = {
  "1": CHAIN.SOLANA,
  "2": CHAIN.ETHEREUM,
  "3": CHAIN.TERRA,
  "4": CHAIN.BSC,
  "5": CHAIN.POLYGON,
  "6": CHAIN.AVAX,
  "7": CHAIN.OASIS,
  "8": CHAIN.ALGORAND,
  "9": CHAIN.AURORA,
  "10": CHAIN.FANTOM,
  "11": CHAIN.KARURA,
  "12": CHAIN.ACALA,
  "13": CHAIN.KLAYTN,
  "14": CHAIN.CELO,
  "15": CHAIN.NEAR,
  "16": CHAIN.MOONBEAM,
  "18": CHAIN.TERRA2,
  "19": CHAIN.INJECTIVE,
  "21": CHAIN.SUI,
  "22": CHAIN.APTOS,
  "23": CHAIN.ARBITRUM,
  "24": CHAIN.OPTIMISM,
  "30": CHAIN.BASE,
  "32": CHAIN.SEI,
  "34": CHAIN.SCROLL,
  "35": CHAIN.MANTLE,
  "36": CHAIN.BLAST,
  "37": CHAIN.XLAYER,
  "38": CHAIN.LINEA,
  "39": CHAIN.BERACHAIN,
  "40": CHAIN.SEI, // Sei EVM
  "44": CHAIN.UNICHAIN,
  "45": CHAIN.WC,
  "46": CHAIN.INK,
  "47": CHAIN.HYPERLIQUID, // HyperEVM
  "48": CHAIN.MONAD,
  "50": CHAIN.MEZO,
  "51": CHAIN.FOGO,
  "52": CHAIN.SONIC,
  "55": CHAIN.PLUME,
  "67": CHAIN.OG,
  "72": CHAIN.ROBINHOOD,
  "4009": CHAIN.NOBLE,
  // zksync: CHAIN.ERA, no Wormhole chain id, so Wormholescan has no zkSync Era transfers
};

// Fake tokens that Wormholescan prices anyway, excluded by their token address
const EXCLUDED_TOKENS = [
  "0x55b0faf9818074716f622453abc296839d559120", // "X20 USD" on BSC, 1T supply: 1B moved BSC -> Ethereum on 2025-07-03, priced at $1.0B
  "0x5b2af7fd27e2ea14945c82dd254c79d3ed34685e", // JEFE on Fantom: one transfer of 1.5e17 units Optimism -> Fantom on 2023-10-11, priced at $64.6M
];

type Operation = {
  id: string;
  sourceChain?: { timestamp: string };
  content?: { standarizedProperties?: { fromChain: number; toChain: number; tokenAddress: string } };
  data?: { usdAmount?: string };
};
type PairRow = { source_chain: string; destination_chain: string; usd: number; txs: number };

const getOperations = async (from: number, to: number): Promise<Operation[]> => {
  const iso = (t: number) => new Date(t * 1000).toISOString().replace(".000Z", "Z");
  const operations = new Map<string, Operation>();
  for (let page = 0; ; page++) {
    const { operations: rows } = await httpGet(`${API}?from=${iso(from)}&to=${iso(to)}&pageSize=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(rows)) throw new Error(`wormhole: unexpected Wormholescan response on page ${page}`);
    const before = operations.size;
    for (const op of rows) operations.set(op.id, op);
    if (rows.length < PAGE_SIZE) return [...operations.values()];
    if (operations.size === before) throw new Error(`wormhole: Wormholescan page ${page} repeats earlier operations`);
  }
};

const prefetch = async (options: FetchOptions): Promise<PairRow[]> => {
  const operations = await getOperations(options.startTimestamp, options.endTimestamp);
  // Wormhole never has a window with no transfers; an empty result means the explorer has not indexed it yet
  if (!operations.length) throw new Error(`wormhole: Wormholescan returned no operations for ${options.dateString}, not indexed yet`);

  const pairs: Record<string, PairRow> = {};
  for (const { id, sourceChain, content, data } of operations) {
    const time = Date.parse(sourceChain?.timestamp ?? "") / 1000;
    if (time < options.startTimestamp || time >= options.endTimestamp) continue;
    const usd = Number(data?.usdAmount || 0);
    if (!Number.isFinite(usd)) throw new Error(`wormhole: non-numeric usdAmount for ${id}: ${data?.usdAmount}`);
    const transfer = content?.standarizedProperties;
    if (!transfer || usd <= 0) continue;
    if (EXCLUDED_TOKENS.includes(String(transfer.tokenAddress).toLowerCase())) continue;
    const key = `${transfer.fromChain}-${transfer.toChain}`;
    pairs[key] ??= { source_chain: String(transfer.fromChain), destination_chain: String(transfer.toChain), usd: 0, txs: 0 };
    pairs[key].usd += usd;
    pairs[key].txs += 1;
  }
  return Object.values(pairs);
};

const fetch = async (options: FetchOptions) => {
  const rows = options.preFetchedResults as PairRow[];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const row of rows) {
    const source = chainMap[row.source_chain];
    const destination = chainMap[row.destination_chain];
    // two Wormhole ids can map to one slug (Sei and Sei EVM)
    if (source && source === destination) continue;
    if (source === options.chain) {
      dailyOutgoingVolume.addUSDValue(row.usd);
      dailyOutgoingTxCount += row.txs;
    }
    if (destination === options.chain) {
      dailyIncomingVolume.addUSDValue(row.usd);
      dailyIncomingTxCount += row.txs;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch: prefetch as any,
  chains: [...new Set(Object.values(chainMap))],
  start: "2022-01-15", // start of the listing's history; Wormholescan also has earlier days
  methodology: {
    OutgoingVolume: "USD value of tokens sent from each chain over Wormhole (Portal token bridge, Native Token Transfers, NEAR Omni Bridge and other apps using Wormhole messages), as priced by Wormholescan. Transfers it cannot price and known fake tokens are excluded.",
    IncomingVolume: "USD value of tokens sent to each chain over Wormhole (Portal token bridge, Native Token Transfers, NEAR Omni Bridge and other apps using Wormhole messages), as priced by Wormholescan. Transfers it cannot price and known fake tokens are excluded.",
    OutgoingTxCount: "Number of priced Wormhole token transfers sent from each chain.",
    IncomingTxCount: "Number of priced Wormhole token transfers sent to each chain.",
  },
};

export default adapter;
