import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

// Public historical volume endpoint and schema:
// https://api.xcpdex.com/openapi.json
const API_URL = "https://api.xcpdex.com/defillama/volume";
const BTC_QUOTED_VOLUME = "BTC-Quoted Spot Volume";
const XCP_QUOTED_VOLUME = "XCP-Quoted Spot Volume";

interface VolumeResponse {
  start_timestamp: number;
  end_timestamp: number;
  volume_by_quote?: {
    BTC?: unknown;
    XCP?: unknown;
  };
}

const parseVolume = (value: unknown, quote: string): number => {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new Error(`counterparty: API returned malformed ${quote} volume (${String(value)})`);
  }
  const amount = new BigNumber(value);
  const numericAmount = amount.toNumber();
  if (
    !amount.isFinite() || amount.isNegative() ||
    amount.isGreaterThan(Number.MAX_SAFE_INTEGER) ||
    !Number.isFinite(numericAmount)
  ) {
    throw new Error(`counterparty: API returned out-of-range ${quote} volume (${value})`);
  }
  return numericAmount;
};

const fetch = async (options: FetchOptions) => {
  const data = await httpGet(API_URL, {
    params: {
      start_timestamp: options.startTimestamp,
      end_timestamp: options.endTimestamp,
    },
  }) as VolumeResponse;

  if (
    data.start_timestamp !== options.startTimestamp ||
    data.end_timestamp !== options.endTimestamp
  ) {
    throw new Error(
      `counterparty: API returned window [${data.start_timestamp}, ${data.end_timestamp}) for requested [${options.startTimestamp}, ${options.endTimestamp})`,
    );
  }

  const btcVolume = parseVolume(data.volume_by_quote?.BTC, "BTC");
  const xcpVolume = parseVolume(data.volume_by_quote?.XCP, "XCP");

  const dailyVolume = options.createBalances();
  dailyVolume.addCGToken("bitcoin", btcVolume, BTC_QUOTED_VOLUME);
  dailyVolume.addCGToken("counterparty", xcpVolume, XCP_QUOTED_VOLUME);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BITCOIN],
  start: "2014-01-14",
  methodology: {
    Volume: "Executed spot notional across every non-hidden Counterparty market quoted in BTC or XCP. Order-book settlements, AMM pool fills, and dispenser executions are each counted once on the quote side. Direct order-book self-matches (maker = taker) are excluded as wash trading. Dispensers use protocol-priced notional rather than the gross Bitcoin payment, which can be shared across assets or include overpayment. Pending order matches, PSBT/UTXO swaps, and markets without a defensible BTC/XCP quote valuation are excluded.",
  },
  breakdownMethodology: {
    Volume: {
      [BTC_QUOTED_VOLUME]: "Quote-side notional for finalized BTC-quoted order-book settlements and AMM fills, plus protocol-priced dispenser executions.",
      [XCP_QUOTED_VOLUME]: "Quote-side notional for finalized XCP-quoted order-book settlements and AMM fills.",
    },
  },
};

export default adapter;
