import {
  Adapter,
  FetchOptions,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const dailyFeesApiURL = "https://xxx.current.finance/api/statistic/daily-revenue";

interface DailyFeesApiResponse {
  code: number;
  message: string;
  data: {
    borrowInterest: string;
    supplySideRevenue: string;
    flashloanFee: string;
    liquidationFee: string;
    liquidatorRevenue: string;
    totalRevenue: string;
    fee: string;
  };
}

const methodology = {
  Fees: 'Total borrow interest, flash loan fees, and liquidation fees paid by borrowers and the liquidated',
  Revenue: 'Borrow interest, flash loan fees, and liquidation fees retained by Current after supplier and liquidator payouts',
  ProtocolRevenue: 'Borrow interest, flash loan fees, and liquidation fees retained by Current',
  SupplySideRevenue: 'Borrow interest distributed to suppliers and liquidation fees paid to liquidators',
};

const fetchCurrentFinanceFees = async ({
  startTimestamp,
  endTimestamp,
  createBalances,
}: FetchOptions) => {
  const url = `${dailyFeesApiURL}?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`;
  const res: DailyFeesApiResponse = await fetchURL(url);
  if (res.code !== 0) {
    throw new Error(`Current Finance API error: ${res.message}`);
  }
  const d = res.data;

  // API returns USD-denominated values (converted on the backend via Pyth EMA price)
  const borrowInterest = Number(d.borrowInterest);
  const supplySideInterest = Number(d.supplySideRevenue);
  const flashloanFee = Number(d.flashloanFee);
  const liquidationRevenue = Number(d.liquidationFee);    // protocol's net cut
  const liquidatorRevenue = Number(d.liquidatorRevenue);  // liquidators' cut (cost)

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Gross Protocol Revenue: everything paid by borrowers / the liquidated
  dailyFees.addUSDValue(borrowInterest, METRIC.BORROW_INTEREST);
  dailyFees.addUSDValue(liquidationRevenue + liquidatorRevenue, METRIC.LIQUIDATION_FEES);
  dailyFees.addUSDValue(flashloanFee, METRIC.FLASHLOAN_FEES);

  // Cost of Revenue: interest paid to suppliers + liquidation paid to liquidators
  dailySupplySideRevenue.addUSDValue(supplySideInterest, METRIC.BORROW_INTEREST);
  dailySupplySideRevenue.addUSDValue(liquidatorRevenue, METRIC.LIQUIDATION_FEES);

  // Gross Profit: protocol's net cut per category; flash loan has no cost
  dailyRevenue.addUSDValue(borrowInterest - supplySideInterest, METRIC.BORROW_INTEREST);
  dailyRevenue.addUSDValue(liquidationRevenue, METRIC.LIQUIDATION_FEES);
  dailyRevenue.addUSDValue(flashloanFee, METRIC.FLASHLOAN_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchCurrentFinanceFees,
      start: "2026-03-25",
    },
  },
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Total interest accrued daily by borrowers',
      [METRIC.LIQUIDATION_FEES]: 'Penalty fees collected when undercollateralized positions are liquidated',
      [METRIC.FLASHLOAN_FEES]: 'Fees paid by users executing flash loans',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: "Current's share of the borrow interest paid by borrowers",
      [METRIC.LIQUIDATION_FEES]: 'Liquidation penalty fees retained by Current',
      [METRIC.FLASHLOAN_FEES]: 'Flash loan fees retained by Current',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: 'Borrow interest distributed to suppliers (liquidity providers)',
      [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid out to liquidators',
    },
  },
};

export default adapter;
