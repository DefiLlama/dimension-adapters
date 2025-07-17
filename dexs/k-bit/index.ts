import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEE_CONTRACT = "0x2994F8C9Df255e3926f73ae892E7464b4F76cd49";
const FEE_CHANGE_BLOCK = 167568912;
const MULTIPLIER = [1 / 0.001, 1 / 0.0007]; // fee percentage was 0.1% and 0.07%
const USDT = ADDRESSES.klaytn.USDT;

const eventAbi =
  "event FeePaid(address indexed referee, address indexed referrer, uint256 fee, uint256 protocolFee, uint256 referrerFee, uint256 refereeFee)";

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances, getFromBlock, getToBlock } = options;
  const dailyVolume = createBalances();
  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();
  const logs = await getLogs({
    target: FEE_CONTRACT,
    eventAbi,
    fromBlock,
    toBlock,
    onlyArgs: false, // need blockNumber
  });
  let total = 0n;
  for (const log of logs) {
    const fee = Number(log.args.fee);
    const blockNumber = log.blockNumber;
    const multiplier = blockNumber < FEE_CHANGE_BLOCK ? MULTIPLIER[0] : MULTIPLIER[1];
    const volume = Math.round(fee * multiplier);
    total += BigInt(volume);
  }
  dailyVolume.add(USDT, total);
  return {
    dailyVolume,
  };
};

const methodology = {
  Volume: `
    Trading volume is calculated from FeePaid events. (easy to implement than checking all types of trades)
    Before block 167568912, volume = fee * 1000 (fee is 0.1% of volume). 
    After, volume = fee * 1428.57142857 (fee is 0.07% of volume). 
    All volume is in USDT.
  `,
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: 1727684950, // timestamp of START_BLOCK 165682304
      meta: { methodology },
    },
  },
};

export default adapter;
