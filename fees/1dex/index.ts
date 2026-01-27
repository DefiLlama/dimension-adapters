import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

async function fetch() {
  const endpoint = `https:///api.1dex.com/24h-fees-info`;
  const {
    data: { trade_fees: dailyFees },
  } = await httpGet(endpoint);
  return { dailyFees };
}

export default {
  adapter: {
    [CHAIN.EOS]: {
      fetch,
      start: "2025-04-26",
      runAtCurrTime: true,
    },
  },
};
