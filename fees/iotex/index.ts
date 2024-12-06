import { Adapter, ProtocolType } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const IOTEX_SUM_GAS_URL = "https://gateway1.iotex.me/analyzer/sumGasFeeIotx";

const fetch = async (timestamp) => {
  const dailyFees = await getDailyFees(timestamp);
  const totalFees = await getTotalFees();

  return {
    dailyFees,
    totalFees,
    timestamp,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.IOTEX]: {
      fetch,
      start: "2021-06-22",
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
