import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { fetchURLWithRetry } from "../../helpers/duneRequest";

const fetch = async (timestamp: number) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp();
  const data = await fetchURLWithRetry(
    `https://api.dune.com/api/v1/query/3099651/results`
  );
  const chainData = data.result.rows[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return {
    dailyVolume: chainData.volume_24,
    timestamp: unixTimestamp,
  };
};

const adapter: any = {
  timetravel: false,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1729296000,
      meta: {
        methodology: {
          dailyVolume:
            "Volume is calculated by summing the token volume of all trades settled on the protocol that day.",
        },
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
