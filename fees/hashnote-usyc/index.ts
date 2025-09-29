// https://usyc.hashnote.com/api/price-reports
// https://usyc.hashnote.com/

import axios from "axios";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

type IResponse = {
  timestamp: string;
  fee: number;
};

const url: string = "https://usyc.hashnote.com/api/price-reports";

const formatTimestampToISO = (timestamp: number | string): string => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString().split("T")[0];
};

const formatDatasToISO = (datas: IResponse[]): IResponse[] => {
  return datas.map(({ timestamp, fee }) => ({
    timestamp: formatTimestampToISO(timestamp),
    fee,
  }));
};

const fetch = async (
  timestamp: number,
  _: any,
  { createBalances }: FetchOptions
): Promise<FetchResultFees> => {
  const dailyFees = createBalances();
  const response = await axios.get(url);

  const datas = formatDatasToISO(response.data.data);
  const isoTimestamp = formatTimestampToISO(timestamp);

  const fees = datas.find(({ timestamp }) => timestamp === isoTimestamp);
  if (fees) dailyFees.add(ADDRESSES.ethereum.USDC, Math.round(fees.fee) * 1e6);

  return { timestamp, dailyFees };
};

const adapter: Adapter = {
  methodology: {
    Fees: "All yields are generated from USYC backing assets.",
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-06-14',
    },
  },
};

export default adapter;
