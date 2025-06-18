import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";

const BondCreatedEvent =
  "event BondCreated(uint256 indexed id, uint256 amount, uint256 price)";

const BondManager = "0x44b497aa4b742dc48Ce0bd26F66da9aecA19Bd75";

const getBondToQuoteToken = () => {
  return {
    0: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
  };
};

export const fetchBond = async (
  balances: Balances,
  revenue: Balances,
  options: FetchOptions
) => {
  const bondToQuoteToken = getBondToQuoteToken();

  const data: any[] = await options.getLogs({
    target: BondManager,
    eventAbi: BondCreatedEvent,
  });

  data.forEach((log: any) => {
    const quoteToken = bondToQuoteToken[log.id];
    balances.add(quoteToken, log.amount);
    revenue.add(quoteToken, log.amount / 10n); // 10% of all bond sales go to treasury
  });
};
