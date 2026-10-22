import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// https://orderly.network/docs/build-on-omnichain/restful-api/public/get-market-volume-by-builder
const URL =
  "https://api.orderly.org/v1/public/futures_market?broker_id=rwaperp_xyz";

const fetch = async (_options: FetchOptions) => {
  const data = await fetchURL(URL);

  const openInterestAtEnd = data.data.rows.reduce(
    (acc: number, market: any) => {
      return (
        acc + Number(market.open_interest || 0) * Number(market.mark_price || 0)
      );
    },
    0,
  );

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.XLAYER],
  runAtCurrTime: true,
  start: "2026-08-19",
};

export default adapter;
