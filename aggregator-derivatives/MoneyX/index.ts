import { request, gql } from "graphql-request";
import { sumTokens2 } from "../../helpers/unwrapLPs";
import { Adapter } from "../../helpers/types";

const endpoints = {
  stats: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/project_clhjdosm96z2v4/moneyx-stats/gn",
  trades: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-trades/v1.0.1/gn",
  raw: "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/moneyx-raw/v1.0.0/gn",
};

// Vault contract holding protocol assets
const VAULT = "0xeB0E5E1a8500317A1B8fDd195097D5509Ef861de";

// Supported assets (BNB Chain)
const TOKENS = [
  "0x55d398326f99059fF775485246999027B3197955", // USDT
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
  "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
  "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", // BTCB
  "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", // ETH
  "0x570A5D26f7765Ecb712C0924E4De545B89fD43dF", // SOL
  "0xbA2aE424d960c26247Dd6c32edC70B295c744C43", // DOGE
  "0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", // XRP
];

// GraphQL queries for stats and trades
const statsQuery = gql`
  query volume($id: String!) {
    volumeStat(id: $id) {
      swap
      margin
      burn
      mint
      liquidation
    }
    feeStat(id: $id) {
      swap
      margin
      burn
      mint
      liquidation
    }
  }
`;

const tradeCountQuery = gql`
  query trades($timestamp: Int!) {
    trades(where: { timestamp_gte: $timestamp }) {
      id
    }
  }
`;

// Fetch daily volume, fees, and trade count
const fetchVolume = async (timestamp: number) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const variables = { id: `${dayTimestamp}:daily`, timestamp: dayTimestamp };

  const [stats, trades] = await Promise.all([
    request(endpoints.stats, statsQuery, variables),
    request(endpoints.trades, tradeCountQuery, variables).catch(() => ({ trades: [] })),
  ]);

  const volume = stats.volumeStat || {};
  const fees = stats.feeStat || {};

  // Convert from wei to token units
  const dailyVolume = Object.values(volume).reduce(
    (a: number, b: any) => a + Number(b || 0) / 1e18,
    0
  );
  const dailyFees = Object.values(fees).reduce(
    (a: number, b: any) => a + Number(b || 0) / 1e18,
    0
  );

  const tradeCount = trades.trades?.length || 0;

  return { timestamp: dayTimestamp, dailyVolume, dailyFees, tradeCount };
};

// Fetch total vault balances (TVL)
const tvl = async (_ts: number, _ethBlock: number, { bsc: block }) =>
  await sumTokens2({
    chain: "bsc",
    block,
    tokensAndOwners: TOKENS.map((t) => [t, VAULT]),
  });

// DefiLlama adapter export
const adapter: Adapter = {
  adapter: {
    bsc: {
      fetch: fetchVolume,
      start: async () => 1720000000,
      tvl,
    },
  },
};

export default adapter;
