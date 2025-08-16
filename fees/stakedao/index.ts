import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';

// Fee recipient addresses
const TREASURY_FEES_RECIPIENT = '0x9EBBb3d59d53D6aD3FA5464f36c2E84aBb7cf5c1';
const VESDT_FEE_RECIPIENT = '0x1fE537BD59A221854a53a5B7a81585B572787fce';
const LIQUIDITY_FEES_RECIPIENT = '0x576D7AD8eAE92D9A972104Aac56c15255dDBE080';

const fetch = async (options: FetchOptions) => {
  // All fees collected from all sources
  const dailyFees = await addTokensReceived({
    options,
    targets: [TREASURY_FEES_RECIPIENT, VESDT_FEE_RECIPIENT, LIQUIDITY_FEES_RECIPIENT]
  });

  // Treasury revenue (Protocol Revenue)
  const dailyProtocolRevenue = await addTokensReceived({
    options,
    targets: [TREASURY_FEES_RECIPIENT]
  });

  // Revenue for veSDT holders
  const dailyHoldersRevenue = await addTokensReceived({
    options,
    targets: [VESDT_FEE_RECIPIENT]
  });

  // Fees paid by users (liquidity fees)
  const dailyUserFees = await addTokensReceived({
    options,
    targets: [LIQUIDITY_FEES_RECIPIENT]
  });
  const dailyRevenue = dailyProtocolRevenue.clone();
  dailyRevenue.addBalances(dailyHoldersRevenue);
  return {
    dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailyRevenue, // Protocol Revenue + Holder Revenue
    dailyUserFees
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-01-01',
    }
  },
  methodology: {
    Fees: "Staking rewards earned by all deposited assets",
    Revenue: "Staking rewards earned by StakeDAO and veSDT holders",
    ProtocolRevenue: "Staking rewards earned by StakeDAO ",
    HoldersRevenue: "Staking rewards earned by veSDT holders",
    SupplySideRevenue: "Staking rewards earned by depositors",
  }
};

export default adapter;
