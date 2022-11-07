import axios from "axios";
import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";


const URL = 'https://api.thegraph.com/subgraphs/name/dmihal/arbitrum-fees-collected'
interface IValue {
  totalFeesETH: string;
}

interface ITx {
  value: string;
}


const SEQUENCER_FEES = '0xa4b1e63cb4901e327597bc35d36fe8a23e4c253f'
const NETWORK_INFRA_FEES = '0xD345e41aE2cb00311956aA7109fC801Ae8c81a52'
const CONGESTION_FEES = '0xa4B00000000000000000000000000000000000F6'

const getWithdrawalTxs = async (address: string, startblock: number, endblock: number) => {
  const url = `https://api.arbiscan.io/api?module=account&action=txlist&address=${address}&startblock=${startblock}&endblock=${endblock}`;
  const data: ITx[] = await axios.get(url).then((e: any) => e.data.result).catch((err: any) => {
    console.log(`error get tx list: ${err}`);
    return [];
  });
  return data.reduce((acc, { value }) => acc + Number(value) / 1e18, 0)
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
        fetch:  async (timestamp: number, _: ChainBlocks) => {
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
          const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);

          const todaysBlock = (await getBlock(todaysTimestamp, "arbitrum", {}));
          const yesterdaysBlock = (await getBlock(yesterdaysTimestamp, "arbitrum", {}));
          const [sequesnerFee, infraFee, congestionFee] = await Promise.all([
            getWithdrawalTxs(SEQUENCER_FEES, todaysBlock, yesterdaysBlock),
            getWithdrawalTxs(NETWORK_INFRA_FEES, todaysBlock, yesterdaysBlock),
            getWithdrawalTxs(CONGESTION_FEES, todaysBlock, yesterdaysBlock),
          ]);
          const withdrawalFee = sequesnerFee + infraFee + congestionFee;

          const pricesObj = await getPrices(["coingecko:ethereum"], todaysTimestamp);
          const dailyFees = (withdrawalFee) * pricesObj["coingecko:ethereum"].price

          return {
              timestamp,
              totalFees: undefined,
              dailyFees: dailyFees.toString(),
              dailyRevenue: "0",
              totalRevenue: "0",
          };
        },
        start: async () => 1575158400
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
