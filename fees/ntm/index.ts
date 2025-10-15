import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const endpoint = "https://api.ntm.ai/feesAndRevenues.php?"
const chainToken = {
  ton: 'the-open-network',
  avax: 'avalanche-2',
  bsc: 'binancecoin',
  ethereum: 'ethereum',
  tron: 'tron',
  solana: 'solana',
}

const fetchFeesAndRevenues = async (options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split(".")[0];
  const endTime = new Date(options.endTimestamp * 1000).toISOString().split(".")[0];
  const res = await httpGet(`${endpoint}start_date=${startTime}&end_date=${endTime}&chain=${options.chain}`);
  const token = chainToken[options.chain]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  dailyFees.addCGToken(token, res.fees_total)
  dailyRevenue.addCGToken(token, res.revenue_total)

  return { dailyFees, dailyRevenue, }
}

const adapter: any = {
  version: 2,
  methodology: {
    Fees: 'Sums the fees of listing request & trending request.',
    Revenue: 'Sums the fees of listing request & trending request.',
  },
  fetch: fetchFeesAndRevenues,
  start: '2023-05-22',
  chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.AVAX, CHAIN.SOLANA, CHAIN.TRON, CHAIN.TON],
}

export default adapter;