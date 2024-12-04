import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const IOTEX_SUM_GAS_URL = "https://gateway1.iotex.me/analyzer/sumGasFeeIotx";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getDailyFees(options.startTimestamp);
  const totalFees = await getTotalFees();

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    totalFees,
    totalRevenue: totalFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.IOTEX]: {
      fetch,
      start: "2021-06-22",
      meta: {
        hallmarks: [
          [1671206400, "IoTeX introduces W3bstream"],
          [1695830400, "IoTeX launches DePINscan"],
          [1724428800, "IoTeX unveils 2.0"],
          [1731600000, "IoTeX launches ioID"],
        ],
      },
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;

const getDailyFees = async (timestamp: number) => {
  const today = new Date(getTimestampAtStartOfDayUTC(timestamp) * 1000)
    .toISOString()
    .split("T")[0];

  const result = await httpGet(
    `${IOTEX_SUM_GAS_URL}?start_date=${today}&end_date=${today}`
  );

  if (!result) {
    throw new Error(`Failed to fetch IoTeX Sum Gas data for ${today}`);
  }

  return parseFloat(result);
};

const getTotalFees = async () => {
  const result = await httpGet(IOTEX_SUM_GAS_URL);

  if (!result) {
    throw new Error(`Failed to fetch IoTeX Total Sum Gas data`);
  }

  return parseFloat(result);
};
