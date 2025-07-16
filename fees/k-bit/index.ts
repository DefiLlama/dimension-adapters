import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEE_CONTRACT = "0x2994F8C9Df255e3926f73ae892E7464b4F76cd49";
const USDT = ADDRESSES.klaytn.USDT;

const eventAbi =
  "event FeePaid(address indexed referee, address indexed referrer, uint256 fee, uint256 protocolFee, uint256 referrerFee, uint256 refereeFee)";

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances, getFromBlock, getToBlock } = options;
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const logs = await getLogs({
    target: FEE_CONTRACT,
    eventAbi,
    fromBlock,
    toBlock,
    onlyArgs: true,
  });
  let totalFee = 0n;
  let totalProtocolRevenue = 0n;
  for (const log of logs) {
    if (log.fee) totalFee += BigInt(log.fee);
    if (log.protocolFee) totalProtocolRevenue += BigInt(log.protocolFee);
  }

  dailyFees.add(USDT, totalFee);
  dailyProtocolRevenue.add(USDT, totalProtocolRevenue);
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Sum of fee from FeePaid events emitted by the K-BIT fee contract.",
  Revenue: "All fee is considered revenue.",
  ProtocolRevenue: "All protocolFee is protocol revenue.",
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
