import ADDRESSES from '../../helpers/coreAssets.json'
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import { CHAIN } from "../../helpers/chains";
import { FetchResultFees } from "../../adapters/types";

interface ILog {
  address: string;
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IAmount {
  creator_fee: number;
  marketplace_fee: number;
  isHaveMPFees: boolean;
}

interface IConrtact {
  adddress: string;
  startBlcok: number;
}

const contract_v1_4 = '0x00000000000001ad428e4906ae43d8f9852d0dd6';
const contract_v1_5 = '0x00000000000000adc04c56bf30ac9d3c0aaf14dc';

const contracts: IConrtact[] = [
  {
    adddress: contract_v1_4,
    startBlcok: 16655960,
  },
  {
    adddress: contract_v1_5,
    startBlcok: 17129405,
  }
]
const topic0 = '0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31';
const event_order_fulfilled = "event OrderFulfilled(bytes32 orderHash, address indexed offerer, address indexed zone, address recipient, (uint8 itemType, address token, uint256 identifier, uint256 amount)[] offer, (uint8 itemType, address token, uint256 identifier, uint256 amount, address recipient)[] consideration)"
const fees_collector = '0x0000a26b00c1f0df003000390027140000faa719';

export const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ETHEREUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ETHEREUM, {}));
  const logs: ILog[] = (await Promise.all(contracts.filter(e => e.startBlcok <= fromBlock).map((contract: IConrtact) => sdk.getEventLogs({
    target: contract.adddress,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ETHEREUM,
    topics: [topic0]
  })))).flat() as ILog[];

  const fes_raw: IAmount[] = logs.filter(e => e.data.length === 1602)
    .map((e: ILog) => {
      const data = e.data.replace('0x', '');
      const fees_1 = Number('0x' + data.slice(18 * 64, (18 * 64) + 64)) / 10 ** 18;
      const address_1 = data.slice((19 * 64), (19 * 64) + 64);
      const contract_address_1 = '0x' + address_1.slice(24, address_1.length);

      const fees_2 = Number('0x' + data.slice(23 * 64, (23 * 64) + 64)) / 10 ** 18;
      const address_2 = data.slice((24 * 64), (24 * 64) + 64);
      const contract_address_2 = '0x' + address_2.slice(24, address_2.length);
      const min = Math.min(fees_1, fees_2);
      const max = Math.max(fees_1, fees_2);
      const isHaveMPFees = [contract_address_1.toLowerCase(), contract_address_2.toLowerCase()].includes(fees_collector.toLowerCase());
      return {
        creator_fee: max,
        marketplace_fee: min,
        isHaveMPFees
      }
    })

  const marketplace_fee = fes_raw
    .filter(e => e.isHaveMPFees)
    .map(e => e.marketplace_fee as number)
    .filter((e) => !isNaN(e))
    .filter(e => e < 100)
    .reduce((a: number, b: number) => a + b, 0)

  const creator_fee = fes_raw.map(e => e.creator_fee as number)
    .filter((e) => !isNaN(e))
    .filter(e => e < 100)
    .reduce((a: number, b: number) => a + b, 0)

  const fees = (marketplace_fee + creator_fee);
  const rev = (marketplace_fee);
  const ethAddress = "ethereum:" + ADDRESSES.null;
  const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
  const dailyFees = (fees * ethPrice)
  const dailyRevenue = (rev * ethPrice)
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    timestamp
  }
}
