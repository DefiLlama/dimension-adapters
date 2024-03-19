import * as sdk from "@defillama/sdk";
const event_deposit = "event Deposit (address indexed user, address indexed receiver, uint256 id, uint256 assets)";

export const getDeposits = async (token: string, vaults: string[], getLogs: any, balances: sdk.Balances,) => {
  const logs_deposit = await getLogs({ targets: vaults, eventAbi: event_deposit, })
  logs_deposit.forEach((log: any) => balances.add(token, log.amount))
}