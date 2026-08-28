// https://docs.splash.trade/concepts/dao/dao-business-model#dao-fees-from-pools

import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url: string = "https://api2.splash.trade/platform-api/v1/platform/stats";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const {
    data: { lpFeeUsd, volumeUsd },
  } = await axios.get(url);
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();
  dailyFees.addCGToken('cardano', Number(lpFeeUsd)/1e6);
  dailyVolume.addCGToken('cardano', Number(volumeUsd)/1e6);
  const dailyRevenue = dailyFees.clone();
  dailyRevenue.resizeBy(0.5 / 100);
  return {
    dailyFees,
    dailyRevenue,
    dailyVolume: dailyVolume,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CARDANO],
  start: '2024-06-04',
  runAtCurrTime: true,
};

export default adapter;
