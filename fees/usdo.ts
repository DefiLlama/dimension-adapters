import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";


const usdo = '0x3D513abc13f53A1E18Ae59A7B5B0930E55733C87';
const BUSD = '0xdfB5E8a4AC08E46258A12AbE737bba5D8c452508';

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyFees = createBalances()
  // fees is 0.5% of the withdrawal amount https://docs.usdo.finance/mint-and-redeem
  const withdrawLogs = await getLogs({ target: usdo, eventAbi: 'event Withdrawal(address indexed wdrAdd, uint256 usdoIn, uint256 usdOut)', })
  withdrawLogs.forEach((log: any) => {
    dailyFees.add(BUSD, Number(log.usdOut) * 0.005)
  })
  return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ONUS]: {
      fetch,
      start: '2023-04-01',
    },
  },
}
export default adapter;
