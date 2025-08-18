import { FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN, } from "../helpers/chains";
import { Chain } from "../adapters/types";


type TAddress = {
  [s: string | Chain]: string;
}

const Vault_Fee_Manager_Contracts: TAddress = {
  [CHAIN.ARBITRUM]: '0xdCC1c692110E0e53Bd57D5B2234867E9C5B98158',
  [CHAIN.POLYGON]: '0x11606d99AD8aAC49E033B14c89552F585028bA7d',
  [CHAIN.OPTIMISM]: '0xbdef6DAD6841aA60Caf462baAee0AA912EeF817A',
  [CHAIN.AVAX]: '0xca3eb45fb186ed4e75b9b22a514ff1d4abadd123',
  [CHAIN.XDAI]: '0xAe09281c842EbfDb2E606F32bd5048183652B4D8'
}

const Performance_Fee_Management_Contracts: TAddress = {
  [CHAIN.ARBITRUM]: '0x580d0B0ed579c22635AdE9C91Bb7A1f0755F9C85',
  [CHAIN.POLYGON]: '0x232627F88a84A657b8A009AC17ffa226a34c9a87',
  [CHAIN.OPTIMISM]: '0x954aC12C339C60EAFBB32213B15af3F7c7a0dEc2',
  // [CHAIN.ETHEREUM]: '0xEd8a2759B0f8ea0f33225C86cB726fa9C6E030A4'
}

const event_fees_withdraw = 'event FeeWithdrawn(address token,uint256 amount)';
const event_token_earned = 'event TokensEarned(address indexed perfToken,address indexed recipient,uint256 amount)';

const fetch: FetchV2 = async ({ chain, createBalances, getLogs, }) => {
  const dailyFees = createBalances()
  const log_withdraw_fees = Vault_Fee_Manager_Contracts[chain] ? (await getLogs({
    target: Vault_Fee_Manager_Contracts[chain],
    eventAbi: event_fees_withdraw
  })) : []

  const log_token_earned = Performance_Fee_Management_Contracts[chain] ? (await getLogs({
    target: Performance_Fee_Management_Contracts[chain],
    eventAbi: event_token_earned
  })) : []

  log_withdraw_fees.map((e: any) => dailyFees.add(e.token, e.amount))
  log_token_earned.map((e: any) => dailyFees.add(e.perfToken, e.amount))
  const dailyRevenue = dailyFees.clone(0.5)
  const totalSupplySideRevenue = dailyFees.clone(0.5)

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue: totalSupplySideRevenue,
  }
}

const info = {
  methodology: {
    Fees: "Total reward and withdraw fees paid by users.",
    Revenue: "50% of collected fees earned by QiDAO, 50% fees to asset suppliers.",
    HoldersRevenue: "100% revenue distributed to token holders.",
  }
};

const options: any = { start: '2023-08-05', }
const adapter: SimpleAdapter = {
  fetch, methodology: info.methodology,
  adapter: {
    [CHAIN.ARBITRUM]: options,
    [CHAIN.POLYGON]: options,
    [CHAIN.OPTIMISM]: options,
    [CHAIN.AVAX]: options,
    [CHAIN.XDAI]: options,
  },
  version: 2,
};

export default adapter;
