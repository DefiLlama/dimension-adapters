import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const FEE_CONTRACT = "0x2994F8C9Df255e3926f73ae892E7464b4F76cd49";
const USDT = ADDRESSES.klaytn.USDT;

const eventAbi =
  "event FeePaid(address indexed referee, address indexed referrer, uint256 fee, uint256 protocolFee, uint256 referrerFee, uint256 refereeFee)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: FEE_CONTRACT,
    eventAbi,
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
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users.",
  Revenue: "Protocol Revenue and Referral Revenue.",
  ProtocolRevenue: "Protocol Revenue share from the trading fees.",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: '2024-09-30',
    },
  },
  methodology,
};

export default adapter;
