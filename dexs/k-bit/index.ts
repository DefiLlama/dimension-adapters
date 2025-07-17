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
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: FEE_CONTRACT,
    eventAbi,
    entireLog: true,
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

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: '2024-09-30'
    },
  },
};

export default adapter;
