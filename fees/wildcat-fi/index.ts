import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const archController = "0xfEB516d9D946dD487A9346F6fee11f40C6945eE4";

const methodology = {
  Fees: "Fee set by the borrower",
  Revenue: "A percentage fee added on top of the borrow fee.",
};

async function getMarkets(api) {
  const markets = await api.call({
    abi: "address[]:getRegisteredMarkets",
    target: archController,
  });

  const tokens = await api.multiCall({ abi: "address:asset", calls: markets });
  return { markets, tokens };
}

async function fetch({ api, createBalances }: FetchOptions) {
  const { markets, tokens } = await getMarkets(api);

  const fetchMarketApr = async (market) => {
    const annualInterestBips = await api.call({
      // https://docs.wildcat.finance/technical-overview/security-developer-dives/core-behaviour#market-configuration
      abi: "uint256:annualInterestBips",
      target: market,
    });
    return Number(annualInterestBips) / 10000;
  };

  const fetchMarketTotalDebts = async (market) => {
    const totalDebts = await api.call({
      // https://docs.wildcat.finance/technical-overview/function-event-signatures/market/wildcatmarketbase.sol#functions
      abi: "uint256:totalDebts",
      target: market,
    });
    return Number(totalDebts);
  };

  const dailyFees = createBalances();
  const dailyProtocolFees = createBalances();
  await Promise.all(
    markets.map(async (market) => {
      const apr = await fetchMarketApr(market);
      const totalDebts = await fetchMarketTotalDebts(market);

      const token = tokens[markets.indexOf(market)];

      const dailyApr = apr / 365;
      const fee = Number(totalDebts) * dailyApr;

      const dailyProtocolApr = dailyApr * 0.05; // 5% according to docs https://docs.wildcat.finance/using-wildcat/protocol-usage-fees
      const protocolFee = Number(totalDebts) * dailyProtocolApr;

      dailyFees.add(token, fee);
      dailyProtocolFees.add(token, protocolFee);
    })
  );

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyProtocolFees,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-12-25",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
