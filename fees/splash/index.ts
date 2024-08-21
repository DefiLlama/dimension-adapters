// https://docs.splash.trade/concepts/dao/dao-business-model#dao-fees-from-pools

import axios from "axios";
import { Adapter, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url: string = "https://api2.splash.trade/platform-api/v1/platform/stats";

const fetch = async (): Promise<FetchResultV2> => {
  const {
    data: { lpFeeUsd, volumeUsd },
  } = await axios.get(url);

  return {
    dailyFees: lpFeeUsd,
    dailyRevenue: lpFeeUsd / 2,
    dailyVolume: volumeUsd,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: 1717452000,
    },
  },
  timetravel: false,
};

export default adapter;
