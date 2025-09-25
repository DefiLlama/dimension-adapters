import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphFees";

interface DailyRevenueResponse {
  dateOfRevenue: string;
  mint: string;
  tokenName: string;
  mintAmount: string;
  amountValueUSD: string;
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) => {
  // Amounts in Step(without decimals)
  const incomingBalancesToFeeWallet: DailyRevenueResponse = await fetchURL('https://api.step.finance/v1/public/get-step-revenue')
  const STEP_MINT = 'StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT'
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const dayTimestamp = getUniqStartOfTodayTimestamp();

  dailyFees.add(STEP_MINT, incomingBalancesToFeeWallet.mintAmount);
  dailyRevenue.add(STEP_MINT, incomingBalancesToFeeWallet.mintAmount);

  return {
    dailyFees,
    dailyRevenue,
    timestamp: dayTimestamp,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: "Fees come from different sources under the Step Finance Organization, Solana Allstars, Solana Floor, Step revenue in its dashboard and APIs.",
    Revenue: "All fees are revenue.",
  }
}
export default adapter
