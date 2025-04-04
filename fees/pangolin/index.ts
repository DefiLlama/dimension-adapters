import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { Adapter } from "../../adapters/types";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
        fetch: getUniV2LogAdapter({
          factory: "0xefa94DE7a4656D787667C749f7E1223D71E9FD88",
          fees: 0.003,
          customLogic: ({ dailyVolume, dailyFees }) => {
            // Protocol Revenue (Treasury): 0.0075% out of 0.3% swap fees
            const dailyRevenue = dailyFees.clone(0.0075 / 0.3);
            // Holders Revenue (PNG Stakers): 0.0425% out of 0.3% swap fees  
            const dailyHoldersRevenue = dailyFees.clone(0.0425 / 0.3);
            // Supply Side Revenue (LPs): 0.25% / 0.3%
            const dailySupplySideRevenue = dailyFees.clone(0.25 / 0.3);
            
            return {
              dailyVolume,
              dailyFees,
              dailyRevenue,
              dailyHoldersRevenue,
              dailySupplySideRevenue
            }
          }
        }),
        start: '2021-02-08',
        meta: {
            methodology: {
                UserFees: "User pays 0.3% fees on each swap.",
                ProtocolRevenue: "Pangolin DAO Treasury receives 0.0075% of each swap.",
                SupplySideRevenue: "LPs receive 0.25% of the fees.",
                HoldersRevenue: "0.0425% is distributed to PNG stakers.",
                Revenue: "All revenue generated comes from user fees.",
                Fees: "All fees come from the user."
              }
        }
      },
  },
};

export default adapter;