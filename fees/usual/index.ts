import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
const YIELD_TREASURY = "0x81ad394C0Fa87e99Ca46E1aca093BEe020f203f4";
const USD0 = "0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5";
const USUAL = "0xC4441c2BE5d8fA8126822B9929CA0b81Ea0DE38E";
const USUALX = "0x06B964d96f5dCF7Eae9d7C559B09EDCe244d4B8E";

const getBalanceOf = async (
  options: FetchOptions,
  token: string,
  account: string
) => {
  const balance = await options.api.call({
    target: token,
    abi: "function balanceOf(address account) external view returns (uint256)",
    params: [account],
  });
  return BigInt(balance);
};

const fetchTreasuryRevenue = async (options: FetchOptions) => {
  const totalRevenue = options.createBalances();
  const usualXHolding = await getBalanceOf(options, USUALX, YIELD_TREASURY);
  totalRevenue.add(USUALX, usualXHolding);

  const usualHolding = await getBalanceOf(options, USUAL, YIELD_TREASURY);
  totalRevenue.add(USUAL, usualHolding);

  const usd0Holding = await getBalanceOf(options, USD0, YIELD_TREASURY);
  totalRevenue.add(USD0, usd0Holding);
  return totalRevenue;
};

const fetchFeesAndRevenue = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // USUAL Revenue breakdown
  const resRev = await queryDune("4957281", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  resRev.map((item: any) => {
    dailyFees.addUSDValue(item?.total_revenue);
  });
  // USUAL Extra Collateral Revenue
  const resFee = await queryDune("4957293", {
    start: options.startTimestamp,
    end: options.endTimestamp,
  });
  resFee.map((item: any) => {
    if (item?.extra_revenue_usd) {
      dailyFees.addUSDValue(item?.extra_revenue_usd);
    }
  });
  const totalRevenue = await fetchTreasuryRevenue(options);
  return {
    totalRevenue,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFeesAndRevenue,
      start: 1716163200,
      runAtCurrTime: false,
      meta: {
        methodology: {
          Fees: "RWA on the treasury generates revenue. User pays fees when redeeming USD0, unlocking USD0++ or exiting vaults",
          Revenue: "DAO holds Usual treasury and earns yield on it.",
        },
      },
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
