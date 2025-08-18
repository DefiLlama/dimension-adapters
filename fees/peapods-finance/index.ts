import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import BigNumber from "bignumber.js";

const HOLDERS_SHARE  = 0.60;  // 60% to vlPEAS
const PROTOCOL_SHARE = 0.40;  // 40% to protocol

// clone + scale Balances by multiplying each raw amount
const scaleBalances = (b: any, factor: number) => {
  const out = Object.assign(Object.create(Object.getPrototypeOf(b)), b);
  out._balances = Object.fromEntries(
    Object.entries(b._balances).map(([k, v]: [string, any]) => [
      k,
      new BigNumber(v).multipliedBy(factor).toFixed(0),
    ])
  );
  return out;
};

const fetch = async (options: FetchOptions) => {
  // Holders' revenue (60%) as Balances
  const holdersB = await addTokensReceived({
    options,
    target: "0x6499Add1cC6223Aeec0BD9e5355EfE10ceF519C5", //vlPEAS wallet
    token:  "0x02f92800f57bcd74066f5709f1daa1a4302df875", //PEAS token
    fromAdddesses: ["0x88eaFE23769a4FC2bBF52E77767C3693e6acFbD5"], //revenue wallet
  });

  // Total (100%) = holders / 0.60
  const totalB    = scaleBalances(holdersB, 1 / HOLDERS_SHARE);
  // Protocol (40%) = holders * (0.40 / 0.60)
  const protocolB = scaleBalances(holdersB, PROTOCOL_SHARE / HOLDERS_SHARE);

  return {
    dailyFees:            totalB,
    dailyUserFees:        totalB,
    dailyRevenue:         totalB,
    dailyProtocolRevenue: protocolB,
    dailyHoldersRevenue:  holdersB,
  };
};

const methodology = {
  Fees: "Includes interest paid, auto-compounding LP yield, liquidation proceeds, LVF open/close actions.",
  Revenue: "We observe the 60% holders revenue on-chain (sent from revenue wallet to vlPEAS wallet) and scale to 100% total revenue.",
  ProtocolRevenue: "40% of total revenue. Covers overhead and team compensation contributing to protocol growth.",
  HoldersRevenue: "60% of total revenue (of which 5% burned as PEAS and the remainder distributed to vlPEAS holders fund).",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2025-04-16" },
    [CHAIN.ARBITRUM]: { fetch, start: "2025-04-16" },
    [CHAIN.BASE]: { fetch, start: "2025-04-16" },
    [CHAIN.SONIC]: { fetch, start: "2025-04-16" },
    [CHAIN.BERACHAIN]: { fetch, start: "2025-04-16" },
  },
};

export default adapter;
