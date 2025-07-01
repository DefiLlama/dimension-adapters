import { FetchResultFees, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from '../../helpers/chains';
import fetchURL, { httpGet,postURL } from "../../utils/fetchURL"
import * as sdk from "@defillama/sdk"

import {Agent} from "https"

const agent = new Agent({
    family: 4
});

const graphs = async (timestamp: number): Promise<FetchResultVolume & FetchResultFees> => {
  let txTime = (timestamp + 1) * 1000;
  const response = await httpGet(`https://api2.byreal.io/byreal/api/dex/v1/overview/global?timestamp=${txTime}`,{ httpsAgent: agent })
  const data = response.result.data


  return {
    dailyVolume: data.volumeUsd24h,
    timestamp: timestamp,
    dailyFees: data.feeUsd24h,
    dailyUserFees: data.feeUsd24h,
    // dailyRevenue: data.feeUsd24h,          // ProtocolRevenue + HoldersRevenue
    // dailyProtocolRevenue: data.feeUsd24h, // Treasury
    // dailyHoldersRevenue: data.feeUsd24h,   // Buybacks
    // dailySupplySideRevenue: data.feeUsd24h, // LPs
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: graphs,
      runAtCurrTime: true,
      start: '2025-06-27',
    },
  },
};

export default adapter;
