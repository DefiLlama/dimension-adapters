import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const methodology = {
  Fees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  UserFees: "A 0.3% fee is charged to users on every swap, 1/6 goes to protocol.",
  SupplySideRevenue: "There are 5/6 of swap fees goes to liquidity providers.",
  Revenue: "There are 1/6 goes to protocol.",
  ProtocolRevenue: "There are 1/6 goes to protocol.",
};

const fetch = async (_a: any, _b: any, { startOfDay }: FetchOptions) => {
  const platformData: Array<any> = await httpGet(`https://server.saucerswap.finance/api/public/pools/platform-data?field=VOLUME_USD&interval=DAY&from=${startOfDay}&to=${startOfDay + 24 * 3600}`,
    {
      headers: {
        origin: "https://www.saucerswap.finance",
      },
    },
  );
  
  const _dailyVolume = platformData.find(
    (dayItem: any) => Number(dayItem.timestampSeconds) === startOfDay,
  );
  
  if (!_dailyVolume) {
    throw Error(`can not found value data for date ${startOfDay}`)
  }
  
  const dailyVolume = Number(_dailyVolume ? _dailyVolume.value : 0)
  
  // https://docs.saucerswap.finance/protocol/saucerswap-v1
  // v1 charges fee 0.3% per swap, 5/6 goes to LP, 1/6 goes to protocol
  const dailyFees = dailyVolume * 0.003;
  const dailyRevenue = (dailyFees * 1) / 6;
  const dailySupplySideRevenue = (dailyFees * 5) / 6;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: "2022-07-31",
    },
  },
  methodology,
};

export default adapter;
