import BigNumber from "bignumber.js";
import { FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { gql, GraphQLClient } from "graphql-request";
import {
  getTimestampAtStartOfMonth,
  getTimestampAtStartOfNextMonth,
} from "../../utils/date";

interface Token {
  ticker: string;
  geckoId: string;
  decimals: number;
}

interface DataItem {
  blockTimestamp: number;
  contract: string;
  token: string;
  amount: string;
}

const tokens = [
  {
    ticker: "ARB",
    geckoId: "coingecko:arbitrum",
    decimals: 18,
  },
  {
    ticker: "ETH",
    geckoId: "coingecko:ethereum",
    decimals: 18,
  },
  {
    ticker: "USDC",
    geckoId: "coingecko:usd-coin",
    decimals: 6,
  },
  {
    ticker: 'sUSDe',
    geckoId: 'coingecko:ethena-staked-usde',
    decimals: 18,
  },
  {
    ticker: 'solvBTC',
    geckoId: 'coingecko:solv-btc',
    decimals: 18,
  }
];

const fetchFeeData = async (url: string, timestamp: number) => {
  const client = new GraphQLClient(url);
  const req = gql`
    query Query {
      feesWithdrawns(where: { blockTimestamp_lte: ${timestamp} }) {
        blockTimestamp
        contract
        token
        amount
      }
    }
  `;
  const response = await client.request(req);
  const feesWithdrawns: DataItem[] = response.feesWithdrawns;
  return feesWithdrawns;
};

const fetchTokenPrices = async (timestamp: number) => {
  const prices = await getPrices(
    tokens.map((token: Token) => token.geckoId),
    timestamp
  );

  return prices;
};

const fetchOnArbitrum: FetchV2 = async ({ startTimestamp }) => {
  const monthStartTimeStamp = getTimestampAtStartOfMonth(startTimestamp);
  const monthEndTimestamp = getTimestampAtStartOfNextMonth(startTimestamp);

  const graphQlUrl = "https://d2.finance/subgraphs/name/smartosc/d2";
  const result = await fetchFeeData(graphQlUrl, startTimestamp);
  const tokenPrices = await fetchTokenPrices(startTimestamp);

  let totalAmount = 0;
  let monthlyAmount = 0;
  for (let data of result) {
    const token = tokens.find((token) => token.ticker === data.token);
    if (token) {
      const price = tokenPrices[token.geckoId].price;
      const amountInDollar = Number(
        BigNumber(data.amount)
          .times(price)
          .dividedBy(BigNumber(10).pow(token.decimals))
      );
      totalAmount += amountInDollar;
      if (
        data.blockTimestamp >= monthStartTimeStamp &&
        data.blockTimestamp < monthEndTimestamp
      ) {
        monthlyAmount += amountInDollar;
      }
    }
  }

  const monthFee = monthlyAmount / 30;

  return {
    dailyFees: monthFee,
    dailyRevenue: monthFee,
    dailyProtocolRevenue: monthFee,
    totalFees: totalAmount,
    totalRevenue: totalAmount,
    totalProtocolRevenue: totalAmount,
  };
};

const fetchOnBase: FetchV2 = async ({ startTimestamp }) => {
  const monthStartTimeStamp = getTimestampAtStartOfMonth(startTimestamp);
  const monthEndTimestamp = getTimestampAtStartOfNextMonth(startTimestamp);

  const graphQlUrl = "https://d2.finance/subgraphs/name/smartosc/base-d2";
  const result = await fetchFeeData(graphQlUrl, startTimestamp);
  const tokenPrices = await fetchTokenPrices(startTimestamp);

  let totalAmount = 0;
  let monthlyAmount = 0;
  for (let data of result) {
    const token = tokens.find((token) => token.ticker === data.token);
    if (token) {
      const price = tokenPrices[token.geckoId].price;
      const amountInDollar = Number(
        BigNumber(data.amount)
          .times(price)
          .dividedBy(BigNumber(10).pow(token.decimals))
      );
      totalAmount += amountInDollar;
      if (
        data.blockTimestamp >= monthStartTimeStamp &&
        data.blockTimestamp < monthEndTimestamp
      ) {
        monthlyAmount += amountInDollar;
      }
    }
  }

  const monthFee = monthlyAmount / 30;

  return {
    dailyFees: monthFee,
    dailyRevenue: monthFee,
    dailyProtocolRevenue: monthFee,
    totalFees: totalAmount,
    totalRevenue: totalAmount,
    totalProtocolRevenue: totalAmount,
  };
};

const fetchOnEthereum: FetchV2 = async ({ startTimestamp }) => {
  const monthStartTimeStamp = getTimestampAtStartOfMonth(startTimestamp);
  const monthEndTimestamp = getTimestampAtStartOfNextMonth(startTimestamp);

  const graphQlUrl = "https://d2.finance/subgraphs/name/smartosc/ethereum-d2";
  const result = await fetchFeeData(graphQlUrl, startTimestamp);
  const tokenPrices = await fetchTokenPrices(startTimestamp);

  let totalAmount = 0;
  let monthlyAmount = 0;
  for (let data of result) {
    const token = tokens.find((token) => token.ticker === data.token);
    if (token) {
      const price = tokenPrices[token.geckoId].price;
      const amountInDollar = Number(
        BigNumber(data.amount)
          .times(price)
          .dividedBy(BigNumber(10).pow(token.decimals))
      );
      totalAmount += amountInDollar;
      if (
        data.blockTimestamp >= monthStartTimeStamp &&
        data.blockTimestamp < monthEndTimestamp
      ) {
        monthlyAmount += amountInDollar;
      }
    }
  }

  const monthFee = monthlyAmount / 30;

  return {
    dailyFees: monthFee,
    dailyRevenue: monthFee,
    dailyProtocolRevenue: monthFee,
    totalFees: totalAmount,
    totalRevenue: totalAmount,
    totalProtocolRevenue: totalAmount,
  };
};

const fetchOnBerachain: FetchV2 = async ({ startTimestamp }) => {
  const monthStartTimeStamp = getTimestampAtStartOfMonth(startTimestamp);
  const monthEndTimestamp = getTimestampAtStartOfNextMonth(startTimestamp);

  const graphQlUrl = "https://api.goldsky.com/api/public/project_cm65f59cocamq01waduix0fu3/subgraphs/bera-d2/1.0.0/gn";
  const result = await fetchFeeData(graphQlUrl, startTimestamp);
  const tokenPrices = await fetchTokenPrices(startTimestamp);

  let totalAmount = 0;
  let monthlyAmount = 0;
  for (let data of result) {
    const token = tokens.find((token) => token.ticker === data.token);
    if (token) {
      const price = tokenPrices[token.geckoId].price;
      const amountInDollar = Number(
        BigNumber(data.amount)
          .times(price)
          .dividedBy(BigNumber(10).pow(token.decimals))
      );
      totalAmount += amountInDollar;
      if (
        data.blockTimestamp >= monthStartTimeStamp &&
        data.blockTimestamp < monthEndTimestamp
      ) {
        monthlyAmount += amountInDollar;
      }
    }
  }

  const monthFee = monthlyAmount / 30;

  return {
    dailyFees: monthFee,
    dailyRevenue: monthFee,
    dailyProtocolRevenue: monthFee,
    totalFees: totalAmount,
    totalRevenue: totalAmount,
    totalProtocolRevenue: totalAmount,
  };
};

export default {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchOnArbitrum,
      start: "2024-01-20",
      runAtCurrTime: true,
    },
    // [CHAIN.BASE]: {
    //   fetch: fetchOnBase,
    //   start: "2024-10-31",
    //   runAtCurrTime: true,
    // }, // on base vault is no fees
    [CHAIN.ETHEREUM]: {
      fetch: fetchOnEthereum,
      start: "2025-01-09",
      runAtCurrTime: true,
    },
    [CHAIN.BERACHAIN]: {
      fetch: fetchOnBerachain,
      start: "2025-01-26",
      runAtCurrTime: true,
    }
  },
};
