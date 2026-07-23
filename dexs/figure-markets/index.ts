import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const BASE_URL = "https://www.figuremarkets.com/service-hft-exchange/api/v1/markets";

interface Market {
  marketType: string;
  volume24h: string;
  makerFee?: { rate?: number };
  takerFee?: { rate?: number };
}

// Only spot-crypto (CRYPTO) and tokenized-securities (ATS) order books charge a
// maker/taker trading fee, and their market objects carry the rate. Tokenized RWA
// loan trades (CONNECT / Figure Connect) and YLDS fund transactions (FUND) charge no
// on-exchange trading fee — their market objects have no fee fields, and Figure's
// on-chain settlement (Provenance exchange module) is configured with zero settlement
// fees. Figure earns on those products through loan servicing and the YLDS interest
// spread, which are not trading fees and are out of scope for this exchange adapter.
// These two types are most of the daily volume, so daily fees stay small by design.
const FEE_LABEL: Record<string, string> = {
  CRYPTO: "Crypto Spot Trading Fees",
  ATS: "Tokenized Securities Trading Fees",
};

async function fetch(options: FetchOptions) {
  const locations = ["US", "CAYMAN"];
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  for (const location of locations) {
    let page = 1;

    while (true) {
      const response = await fetchURL(`${BASE_URL}?location=${location}&page=${page}`);
      const markets: Market[] = response.data;

      if (!markets || markets.length === 0) break;

      for (const market of markets) {
        const volume = Number(market.volume24h || 0);
        if (volume === 0) continue;

        dailyVolume.addUSDValue(volume);

        // Fee rates are decimals (0.001 = 0.1%). Both maker and taker pay their own
        // fee on the trade notional. Zero-fee market types (CONNECT/FUND) add nothing.
        const feeRate = (market.makerFee?.rate ?? 0) + (market.takerFee?.rate ?? 0);
        if (feeRate > 0) {
          dailyFees.addUSDValue(volume * feeRate, FEE_LABEL[market.marketType] ?? "Trading Fees");
        }
      }

      page++;
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const methodology = {
  Volume: "Sum of each market's 24h traded notional across all Figure Markets order books — spot crypto, tokenized securities, tokenized RWA loans (Figure Connect) and the YLDS fund.",
  Fees: "Maker + taker trading fees. Spot crypto pairs charge up to 0.1% per side (stablecoin pairs are free) and tokenized-securities pairs charge 0.03% per side; tokenized RWA loan trades and YLDS fund transactions have no trading fee, so they add nothing even though they are most of the volume.",
  Revenue: "Maker + taker trading fees. Figure keeps all trading fees — this is an order-book exchange with no liquidity providers to pay.",
  ProtocolRevenue: "Maker + taker trading fees. Figure keeps all trading fees — this is an order-book exchange with no liquidity providers to pay.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.PROVENANCE],
  runAtCurrTime: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      "Crypto Spot Trading Fees": "Up to 0.1% maker + 0.1% taker on each spot-crypto trade's notional; stablecoin pairs are fee-free.",
      "Tokenized Securities Trading Fees": "0.03% maker + 0.03% taker charged on each tokenized-securities (ATS) trade's notional.",
    },
    Revenue: {
      "Crypto Spot Trading Fees": "Crypto spot trading fees, all retained by Figure.",
      "Tokenized Securities Trading Fees": "Tokenized-securities trading fees, all retained by Figure.",
    },
    ProtocolRevenue: {
      "Crypto Spot Trading Fees": "Crypto spot trading fees, all retained by Figure.",
      "Tokenized Securities Trading Fees": "Tokenized-securities trading fees, all retained by Figure.",
    },
  },
};

export default adapter;
