import { FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const subManagement = '0x3797C46db697c24a983222c335F17Ba28e8c5b69'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const logs = await options.getLogs({
    target: subManagement,
    eventAbi: "event TransferPlatformFee(address indexed from, address indexed token, uint256 amount)",
  })

  logs.forEach(log => {
    dailyFees.add(log.token, log.amount);
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

export default {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2024-05-24',
  methodology: {
    Fees: "Platform fees on subscription and redemption of tokens",
    Revenue: "Platform fees paid by users on subscription and redemption",
  }
};
