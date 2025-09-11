import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const YDL = "0xfB7920B55887840643e20952f22Eb18dDC474B2B";

// Recipient addresses
const ZVL = "0x0C03592375ed4Aa105C0C19249297bD7c65fb731";
const stZVE = "0xb397Aa1D78109115dCC57B907dCD9d61Bb6b2DCE";
const stSTT = "0x0D45c292baCdC47CE850E4c83a2FA2e8509DEd5D";
const stJTT = "0xcacdB1A5a11F824E02De4CA6E7b2D12BB278aA7c";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const yieldDistributedSingleLogs = await options.getLogs({
    target: YDL,
    eventAbi: "event YieldDistributedSingle(address indexed asset, address indexed recipient, uint256 amount)",
  });

  yieldDistributedSingleLogs.forEach((log) => {
    const recipient = log.recipient.toLowerCase();
    const asset = log.asset;
    const amount = log.amount;

    dailyFees.add(asset, amount);

    if (recipient === stZVE.toLowerCase()) {
      dailyHoldersRevenue.add(asset, amount);
      dailyRevenue.add(asset, amount);
    } else if (recipient === ZVL.toLowerCase()) {
      dailyProtocolRevenue.add(asset, amount);
      dailyRevenue.add(asset, amount);
    } else if (recipient === stSTT.toLowerCase() || recipient === stJTT.toLowerCase()) {
      dailySupplySideRevenue.add(asset, amount);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Total interest income generated from outstanding loans and DeFi positions.",
    Revenue: "The sum of Holder Revenue and Protocol Revenue.",
    HoldersRevenue: "The portion of fees distributed to governance token stakers.",
    ProtocolRevenue: "The portion of fees retained by Zivoe.",
    SupplySideRevenue: "The portion of fees distributed to zVLT token holders.",
  },
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-10-10",
    },
  },
};

export default adapter;
