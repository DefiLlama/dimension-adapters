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
  volume_by_quote: {
    BTC: string;
    XCP: string;
  };
}

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

  const btcVolume = new BigNumber(data.volume_by_quote?.BTC);
  const xcpVolume = new BigNumber(data.volume_by_quote?.XCP);
  if (
    !btcVolume.isFinite() || btcVolume.isNegative() ||
    !xcpVolume.isFinite() || xcpVolume.isNegative()
  ) {
    throw new Error(
      `counterparty: API returned invalid quote volume (BTC=${data.volume_by_quote?.BTC}, XCP=${data.volume_by_quote?.XCP})`,
    );
  }

  const dailyVolume = options.createBalances();
  // addCGToken represents human-readable CoinGecko amounts as JS numbers;
  // BigNumber above keeps validation exact until this SDK boundary.
  dailyVolume.addCGToken("bitcoin", btcVolume.toNumber(), BTC_QUOTED_VOLUME);
  dailyVolume.addCGToken("counterparty", xcpVolume.toNumber(), XCP_QUOTED_VOLUME);
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
