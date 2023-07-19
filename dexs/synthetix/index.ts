import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";

const topics0_modified_positions = '0xc0d933baa356386a245ade48f9a9c59db4612af2b5b9c17de5b451c628760f43';
const topics0_postions_liq = '0x8e83cfbf9c95216dce50909e376c0dcc3e23129a3aa1edd5013fa8b41648f883';

const event_modified_positions = 'event PositionModified(uint indexed id,address indexed account,uint margin,int size,int tradeSize,uint lastPrice,uint fundingIndex,uint fee,int skew)';
const event_postions_liq = 'event PositionLiquidated(uint id,address account,address liquidator,int size,uint price,uint flaggerFee,uint liquidatorFee,uint stakersFee)';

const contract_interface = new ethers.utils.Interface([
  event_modified_positions,
  event_postions_liq
]);
const contracts: string[] = [
  '0x0ea09d97b4084d859328ec4bf8ebcf9ecca26f1d',
  '0x59b007e9ea8f89b069c43f8f45834d30853e3699',
  '0x2b3bb4c683bfc5239b029131eef3b1d214478d93',
  '0x509072a5ae4a87ac89fc8d64d94adcb44bd4b88e',
  '0x31a1659ca00f617e86dc765b6494afe70a5a9c1a',
  '0x3d3f34416f60f77a0a6cc8e32abe45d32a7497cb',
  '0x87ae62c5720dab812bdacba66cc24839440048d1',
  '0x09f9d7aaa6bef9598c3b676c0e19c9786aa566a8',
  '0x5b6beb79e959aac2659bee60fe0d0885468bf886',
  '0x69f5f465a46f324fb7bf3fd7c0d5c00f7165c7ea',
  '0x6110df298b411a46d6edce72f5caca9ad826c1de',
  '0x442b69937a0daf9d46439a71567fabe6cb69fbaf',
  '0xdcb8438c979fa030581314e5a5df42bbfed744a0',
  '0xc18f85a6dd3bcd0516a1ca08d3b1f0a4e191a2c4',
  '0x96690aae7cb7c4a9b5be5695e94d72827decc33f',
  '0x98ccbc721cc05e28a125943d69039b39be6a21e9',
  '0xc203a12f298ce73e44f7d45a4f59a43dbffe204d',
  '0x4308427c463caeaab50fff98a9dec569c31e4e87',
  '0x074b8f19fc91d6b2eb51143e1f186ca0ddb88042',
  '0x852210f0616ac226a486ad3387dbf990e690116a',
  '0x0940b0a96c5e1ba33aee331a9f950bb2a6f2fb25',
  '0x5374761526175b59f1e583246e20639909e189ce',
  '0xf9dd29d2fd9b38cd90e390c797f1b7e0523f43a9',
  '0x9615b6bfff240c44d3e33d0cd9a11f563a2e8d8b',
  '0xaa94c874b91ef16c8b56a1c5b2f34e39366bd484',
]

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = (await getBlock(fromTimestamp, CHAIN.OPTIMISM, {}));
    const toBlock = (await getBlock(toTimestamp, CHAIN.OPTIMISM, {}));


    const logs_modify: ILog[] = (await Promise.all(contracts.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: CHAIN.OPTIMISM,
      topics: [topics0_modified_positions]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output).flat();

    const logs_liq: ILog[] = (await Promise.all(contracts.map((address: string) => sdk.api.util.getLogs({
        target: address,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain: CHAIN.OPTIMISM,
        topics: [topics0_postions_liq]
      }))))
        .map((p: any) => p)
        .map((a: any) => a.output).flat();
    const tradeVolume = logs_modify.map((e: ILog) => {
      const value = contract_interface.parseLog(e)
      const tradeSize = Number(value.args.tradeSize._hex.replace('-', '')) / 10 ** 18;
      const lastPrice = Number(value.args.lastPrice._hex.replace('-', '')) / 10 ** 18;
      return (tradeSize * lastPrice);
    }).filter((e: number) => !isNaN(e)).reduce((a: number, b: number) => a + b, 0);

    const liqVolume = logs_liq.map((e: ILog) => {
      const value = contract_interface.parseLog(e)
      const tradeSize = Number(value.args.size._hex.replace('-', '')) / 10 ** 18;
      const lastPrice = Number(value.args.price._hex.replace('-', '')) / 10 ** 18;
      return (tradeSize * lastPrice);
    }).filter((e: number) => !isNaN(e)).reduce((a: number, b: number) => a + b, 0);
    const dailyVolume = tradeVolume + liqVolume;
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchVolume,
      start: async () => 1682121600,
    },
  }
};

export default adapter;
