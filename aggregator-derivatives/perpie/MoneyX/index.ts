import { request, gql } from "graphql-request";
import { sumTokens2 } from "../helpers/unwrapLPs";
import { Adapter } from "../helpers/types";

// MoneyX Subgraph
const endpoint =
  "https://api.goldsky.com/api/public/project_clhjdosm96z2v49wghcvog65t/subgraphs/project_clhjdosm96z2v4/moneyx-stats/gn";

// Vault contract
const VAULT = "0xeB0E5E1a8500317A1B8fDd195097D5509Ef861de";

// BSC Token Addresses
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

const query = gql`
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

const fetchVolume = async (timestamp: number) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const variables = { id: `${dayTimestamp}:daily` };
  const res = await request(endpoint, query, variables);
  const volume = res.volumeStat || {};
  const fees = res.feeStat || {};

  const dailyVolume = Object.values(volume).reduce((a: any, b: any) => a + Number(b || 0), 0);
  const dailyFees = Object.values(fees).reduce((a: any, b: any) => a + Number(b || 0), 0);

  return { timestamp: dayTimestamp, dailyVolume, dailyFees };
};

const tvl = async (_ts: number, _ethBlock: number, { bsc: block }) =>
  await sumTokens2({
    chain: "bsc",
    block,
    tokensAndOwners: TOKENS.map((t) => [t, VAULT]),
  });

const adapter: Adapter = {
  adapter: {
    bsc: {
      fetch: fetchVolume,
      start: async () => 1720000000, // earliest subgraph timestamp
      tvl,
    },
  },
  isExpensiveAdapter: false,
};

export default adapter;
