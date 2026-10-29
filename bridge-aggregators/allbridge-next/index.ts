import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/*
Allbridge Next (https://next.allbridge.io) is a cross-chain swap aggregator: transfers are settled by
intent-based liquidity providers (NEAR Intents, LI.FI Intents) through per-transfer deposit addresses, so there
are no Allbridge contracts on the source or destination chains to read events from. Volume and fees come from
the transfer feed of Allbridge's explorer API (GET /transfers?app=next), the same feed the Next explorer
(https://next.allbridge.io/explorer) reads. Every row is one transfer with its send tx hash, USD amount and fee.
The old Next stats API (api.next.allbridge.io/stats/daily) was suspended in October 2026.
*/

const TRANSFERS_URL = "https://api.core.allbridge.io/transfers";
const PAGE_SIZE = 20; // max limit the API accepts
const ALLBRIDGE_NEXT_START = "2026-04-17"; // first Allbridge Next transfer
const ALLBRIDGE_FEES = "Allbridge Fees";

type AllbridgeNextChainConfig = {
  chainId: string; // Allbridge chain symbol (source chain of the transfer)
  start: string;
};

// DefiLlama chain -> Allbridge chain symbol
const allbridgeNextChainConfig: Record<string, AllbridgeNextChainConfig> = {
  [CHAIN.ETHEREUM]: { chainId: "ETH", start: ALLBRIDGE_NEXT_START },
  [CHAIN.ARBITRUM]: { chainId: "ARB", start: ALLBRIDGE_NEXT_START },
  [CHAIN.BSC]: { chainId: "BSC", start: ALLBRIDGE_NEXT_START },
  [CHAIN.BASE]: { chainId: "BAS", start: ALLBRIDGE_NEXT_START },
  [CHAIN.POLYGON]: { chainId: "POL", start: ALLBRIDGE_NEXT_START },
  [CHAIN.TRON]: { chainId: "TRX", start: ALLBRIDGE_NEXT_START },
  [CHAIN.SOLANA]: { chainId: "SOL", start: ALLBRIDGE_NEXT_START },
  [CHAIN.STELLAR]: { chainId: "SRB", start: ALLBRIDGE_NEXT_START },
  [CHAIN.TON]: { chainId: "TON", start: ALLBRIDGE_NEXT_START },
  [CHAIN.XLAYER]: { chainId: "OKX", start: ALLBRIDGE_NEXT_START },
};

type AllbridgeNextTransfer = {
  id: string;
  app: string; // "next" for Allbridge Next; Allbridge Core transfers are "core" and tracked on-chain in allbridge-core
  status: string; // "Complete" once delivered
  refunded: boolean;
  timestamp: number; // ms, time of the send transaction
  fromChainSymbol: string;
  fromAmount: string; // in source token units, fee included
  fromAmountUsd: string;
  sendFee: string; // Allbridge fee, in source token units
};

// The feed has no time filter: it is sorted by timestamp, newest first, and each page returns PAGE_SIZE + 1 rows
// (the extra row is the first row of the next page). Find the first page reaching into the window, then read
// pages until they are older than the window.
const getTransferPage = async (page: number): Promise<AllbridgeNextTransfer[]> => {
  const { items } = await fetchURL(`${TRANSFERS_URL}?page=${page}&limit=${PAGE_SIZE}&app=next`);
  if (!Array.isArray(items)) throw new Error(`Allbridge Next transfers page ${page}: unexpected response`);
  return items;
};

const getTransfers = async (fromMs: number, toMs: number) => {
  const pages: Record<number, AllbridgeNextTransfer[]> = {};
  const getPage = async (page: number) => pages[page] ??= await getTransferPage(page);
  const reachesWindow = async (page: number) => {
    const items = await getPage(page);
    return items.length === 0 || items[items.length - 1].timestamp < toMs;
  };

  let low = 1;
  let high = 1;
  while (!(await reachesWindow(high))) {
    low = high + 1;
    high *= 2;
  }
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (await reachesWindow(mid)) high = mid;
    else low = mid + 1;
  }

  const transfers = new Map<string, AllbridgeNextTransfer>();
  for (let page = high; ; page++) {
    const items = await getPage(page);
    for (const transfer of items)
      if (transfer.timestamp >= fromMs && transfer.timestamp < toMs) transfers.set(transfer.id, transfer);
    if (items.length <= PAGE_SIZE || items[items.length - 1].timestamp < fromMs) break;
  }
  return [...transfers.values()];
};

// The framework types prefetch results as a dimension record, while this API returns rows;
// the rows are handed back to fetch() through options.preFetchedResults unchanged.
const prefetch: FetchV2 = async (options: FetchOptions) => {
  const transfers = await getTransfers(options.startTimestamp * 1000, options.endTimestamp * 1000);
  const knownChains = new Set(Object.values(allbridgeNextChainConfig).map(({ chainId }) => chainId));
  const unknownChains = [...new Set(transfers.map((transfer) => transfer.fromChainSymbol))].filter((chainId) => !knownChains.has(chainId));
  if (unknownChains.length) throw new Error(`Allbridge Next: transfers from unmapped source chains ${unknownChains.join(", ")}`);
  return transfers as any;
};

// `sendFee` is only Allbridge's own fee (a fixed share of the transfer amount, paid to Allbridge's fee account).
// Settlement provider and relayer costs are part of the quoted rate, not part of this fee, so there is no
// supply-side revenue to report. Refunded transfers never settled and are skipped.
const fetch = async (options: FetchOptions) => {
  const { chainId } = allbridgeNextChainConfig[options.chain];
  const transfers = (options.preFetchedResults ?? []) as AllbridgeNextTransfer[];
  const dailyFees = options.createBalances();
  let dailyBridgeVolume = 0;

  for (const transfer of transfers) {
    if (transfer.app !== "next" || transfer.fromChainSymbol !== chainId || transfer.status !== "Complete" || transfer.refunded) continue;
    const amountUsd = Number(transfer.fromAmountUsd);
    dailyBridgeVolume += amountUsd;
    dailyFees.addUSDValue(Number(transfer.sendFee) * amountUsd / Number(transfer.fromAmount), ALLBRIDGE_FEES);
  }

  return {
    dailyBridgeVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch,
  adapter: allbridgeNextChainConfig,
  methodology: {
    BridgeVolume: "USD value of successful cross-chain transfers initiated on the chain through Allbridge Next, from the per-transfer feed of the Allbridge explorer API.",
    Fees: "Allbridge fee (a fixed share of the transfer amount) paid by users on top of the settlement quote of every Allbridge Next transfer, valued in USD at the transfer's price from the Allbridge explorer API. Settlement provider and relayer costs are part of the quoted rate and are not included.",
    Revenue: "All Allbridge fees (a share of the transfer amount) go to Allbridge.",
    ProtocolRevenue: "All Allbridge fees (a share of the transfer amount) go to Allbridge.",
  },
  breakdownMethodology: {
    Fees: {
      [ALLBRIDGE_FEES]: "Allbridge fee charged on each transfer as a share of the transfer amount.",
    },
    Revenue: {
      [ALLBRIDGE_FEES]: "Allbridge fees are kept by Allbridge.",
    },
    ProtocolRevenue: {
      [ALLBRIDGE_FEES]: "Allbridge fees are kept by Allbridge.",
    },
  },
};

export default adapter;
