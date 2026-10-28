import { SimpleAdapter, FetchOptions } from "../../adapters/types";
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

const fetch = async ({ startTimestamp, endTimestamp, createBalances }: FetchOptions) => {
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
  dailySupplySideRevenue.addUSDValue(supplySideInterest, "Borrow Interest To Suppliers");
  dailySupplySideRevenue.addUSDValue(liquidatorRevenue, "Liquidation Fees To Liquidators");

  // Gross Profit: protocol's net cut per category; flash loan has no cost
  dailyRevenue.addUSDValue(borrowInterest - supplySideInterest, "Borrow Interest To Protocol");
  dailyRevenue.addUSDValue(liquidationRevenue, "Liquidation Fees To Protocol");
  dailyRevenue.addUSDValue(flashloanFee, "Flash Loan Fees To Protocol");

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: 'Total borrow interest, flash loan fees, and liquidation fees paid by borrowers and the liquidated',
  Revenue: 'Borrow interest, flash loan fees, and liquidation fees retained by Current after supplier and liquidator payouts',
  ProtocolRevenue: 'Borrow interest, flash loan fees, and liquidation fees retained by Current',
  SupplySideRevenue: 'Borrow interest distributed to suppliers and liquidation fees paid to liquidators',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Total interest accrued daily by borrowers',
    [METRIC.LIQUIDATION_FEES]: 'Penalty fees collected when undercollateralized positions are liquidated',
    [METRIC.FLASHLOAN_FEES]: 'Fees paid by users executing flash loans',
  },
  Revenue: {
    "Borrow Interest To Protocol": "Current's share of the borrow interest paid by borrowers",
    "Liquidation Fees To Protocol": 'Liquidation penalty fees retained by Current',
    "Flash Loan Fees To Protocol": 'Flash loan fees retained by Current',
  },
  SupplySideRevenue: {
    "Borrow Interest To Suppliers": 'Borrow interest distributed to suppliers (liquidity providers)',
    "Liquidation Fees To Liquidators": 'Liquidation fees paid out to liquidators',
  },
};


const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: "2026-03-25",
  methodology,
  breakdownMethodology,
  pullHourly: false, //api doesnt truly return hourly data
};

export default adapter;
