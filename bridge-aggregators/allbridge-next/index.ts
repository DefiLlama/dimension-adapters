import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

/*
Allbridge Next (https://next.allbridge.io) is a cross-chain swap aggregator: transfers are settled by
intent-based liquidity providers through per-transfer deposit addresses, so there are no Allbridge
contracts on the source or destination chains to read events from. Daily volume and fees come from
the Allbridge Next public stats API (GET /stats/daily, documented at https://api.next.allbridge.io/docs),
which aggregates the transfers indexed on-chain by Allbridge.
*/

const API_URL = "https://api.next.allbridge.io/stats/daily";
const ALLBRIDGE_NEXT_START = "2026-04-17"; // first Allbridge Next transfer
const ALLBRIDGE_FEES = "Allbridge Fees";

type AllbridgeNextChainConfig = {
  chainId: string; // Allbridge Next chain symbol (source chain of the transfer)
  start: string;
};

// DefiLlama chain -> Allbridge Next chain symbol
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

type AllbridgeNextDailyStat = {
  date: string; // YYYY-MM-DD, UTC day of the send transaction
  sourceChain: string; // Allbridge chain symbol
  volumeUsd: string; // USD value of successful transfers sent that day
  feesUsd: string; // Allbridge fees in USD collected on those transfers
  transfers: number;
};


// The framework types prefetch results as a dimension record, while this API returns rows;
// the rows are handed back to fetch() through options.preFetchedResults unchanged.
const prefetch: FetchV2 = async (options: FetchOptions) => {
  const res = await httpGet(`${API_URL}?from=${options.dateString}&to=${options.dateString}`);
  return res.data;
};

const getAllbridgeNextDailyStats = (options: FetchOptions) => {
  const stats = (options.preFetchedResults ?? []) as AllbridgeNextDailyStat[];
  const { chainId } = allbridgeNextChainConfig[options.chain];
  const rows = stats.filter((row) => row.sourceChain === chainId && row.date === options.dateString);
  return {
    volumeUsd: rows.reduce((sum, row) => sum + Number(row.volumeUsd), 0),
    feesUsd: rows.reduce((sum, row) => sum + Number(row.feesUsd), 0),
  };
};

// `feesUsd` is only Allbridge's own fee: the stats API sums the fee that Allbridge attaches to each transfer
// (a fixed share of the transfer amount, paid to Allbridge's fee account). Settlement provider and relayer
// costs are part of the quoted rate, not part of this fee, so there is no supply-side revenue to report.
const fetch = async (options: FetchOptions) => {
  const { volumeUsd, feesUsd } = getAllbridgeNextDailyStats(options);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(feesUsd, ALLBRIDGE_FEES);

  return {
    dailyBridgeVolume: volumeUsd,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1, // the stats API only returns daily aggregates
  fetch,
  prefetch,
  adapter: allbridgeNextChainConfig,
  methodology: {
    BridgeVolume: "USD value of successful cross-chain transfers initiated on the chain through Allbridge Next, as reported by the Allbridge Next stats API from transfers indexed on-chain by Allbridge.",
    Fees: "Allbridge fee (a fixed share of the transfer amount) paid by users on top of the settlement quote of every Allbridge Next transfer, in USD as reported by the Allbridge Next stats API. Settlement provider and relayer costs are part of the quoted rate and are not included.",
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
