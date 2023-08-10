import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEtherscanFees } from "../helpers/etherscanFees";

const adapter: Adapter = {
  adapter: {
    [CHAIN.FANTOM]: {
        fetch:  async (timestamp: number) => {
            const usdFees = await getEtherscanFees(timestamp, `https://ftmscan.com/chart/transactionfee?output=csv`, "coingecko:fantom")
            return {
                timestamp,
                dailyFees: usdFees.toString(),
                dailyRevenue: (usdFees*0.3).toString(),
            };
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
