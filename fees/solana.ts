import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import axios from 'axios';
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import { queryDune } from "../helpers/dune";


interface IFees {
  block_date: string;
  total_fees: number;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: async (timestamp: number) => {
        const ts = getTimestampAtStartOfDayUTC(timestamp)
        const next = ts + 86400;
        const dailyFees: IFees = (await queryDune('3277066', {
          endTime: next,
        }))[0]


        const solanaFee = dailyFees.total_fees;
        const pricesObj = await getPrices(["coingecko:solana"], ts);
        const usdFees = (solanaFee * pricesObj["coingecko:solana"].price);
        const dailyRevenue = usdFees * 0.5;

        return {
          timestamp,
          dailyFees: usdFees.toString(),
          dailyRevenue: dailyRevenue.toString(),
          dailyHoldersRevenue: dailyRevenue.toString(),
        };
      },
      start: async () => 1610841600
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
