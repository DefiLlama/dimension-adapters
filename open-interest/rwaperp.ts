import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Docs: https://orderly.network/docs/build-on-omnichain/public-info-api/platform/platform-positions
const URL = "https://api.orderly.org/v1/public/query";
const BROKER_ID = "rwaperp_xyz";

const fetch = async () => {
  const { success, data } = await httpPost(URL, { type: "platformPositions", broker_id: BROKER_ID, limit: 1 });
  if (!success || !data) throw new Error(`Orderly platformPositions failed for broker ${BROKER_ID}`);

  const longOpenInterestAtEnd = Number(data.total_long_notional);
  const shortOpenInterestAtEnd = Number(data.total_short_notional);
  if (!Number.isFinite(longOpenInterestAtEnd) || !Number.isFinite(shortOpenInterestAtEnd))
    throw new Error(`Orderly platformPositions returned non-numeric totals for broker ${BROKER_ID}`);

  // Counterparties mostly sit on other brokers, so this broker's longs and shorts do not
  // net to one side of each contract; both sides held by its users are counted.
  const openInterestAtEnd = longOpenInterestAtEnd + shortOpenInterestAtEnd;

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ORDERLY],
  runAtCurrTime: true,
  doublecounted: true, // orderly perps
  methodology: {
    OpenInterest: "USD notional of all open long and short perpetual positions held by accounts registered through the RWA Perp interface on Orderly Network.",
  },
};

export default adapter;
