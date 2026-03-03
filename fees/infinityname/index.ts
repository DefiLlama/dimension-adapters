import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, { address: string, start: string }> = {
  [CHAIN.BASE]: {
    address: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
    start: '2024-06-01',
  },
  [CHAIN.OPTIMISM]: {
    address: "0x160F10843389773986F44Db9B64e318c50b7fC7F",
    start: '2024-06-01',
  },
  [CHAIN.BOB]: {
    address: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
    start: '2024-08-01',
  },
  [CHAIN.SONEIUM]: {
    address: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
    start: '2025-01-14',
  },
  [CHAIN.INK]: {
    address: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
    start: '2024-12-18',
  },
  [CHAIN.UNICHAIN]: {
    address: "0x86f6d95E688A5953074C0aBCb0d9d930837E528E",
    start: '2025-02-11',
  },
};

const abi_event = {
  registrationFeeCollected: "event RegistrationFeeCollected(address indexed recipient, uint256 amount)",
  referralPaid: "event ReferralPaid(address indexed referrer, uint256 amount, address indexed buyer)",
};

const fetch = async (options: FetchOptions) => {
  const { address: contractAddress, start } = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const referralFees = options.createBalances();

  const feeCollectedLogs = await options.getLogs({
    target: contractAddress,
    eventAbi: abi_event.registrationFeeCollected,
  });

  feeCollectedLogs.forEach((log: any) => {
    if (log.amount) {
      dailyFees.addGasToken(log.amount);
      dailyRevenue.addGasToken(log.amount);
    }
  });

  const referralLogs = await options.getLogs({
    target: contractAddress,
    eventAbi: abi_event.referralPaid,
  });

  referralLogs.forEach((log: any) => {
    if (log.amount) {
      dailyFees.addGasToken(log.amount);
      referralFees.addGasToken(log.amount);
    }
  });

  dailyRevenue.subtract(referralFees);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Domain registration fees paid by users in native tokens (includes protocol fees + referral commissions)",
  Revenue: "Registration fees collected by the protocol's feeRecipient address minus referral commissions",
  ProtocolRevenue: "Registration fees collected by the protocol's feeRecipient address minus referral commissions",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
