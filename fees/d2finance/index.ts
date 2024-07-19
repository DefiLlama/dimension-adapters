import BigNumber from "bignumber.js";
import { FetchV2 } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
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
];

const fetchFeeData = async (timestamp: number) => {
  const client = new GraphQLClient("https://d2.finance/subgraphs/name/d2");
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

const fetch: FetchV2 = async ({ startTimestamp }) => {
  const monthStartTimeStamp = getTimestampAtStartOfMonth(startTimestamp);
  const monthEndTimestamp = getTimestampAtStartOfNextMonth(startTimestamp);

  const result = await fetchFeeData(startTimestamp);
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
    [ARBITRUM]: {
      fetch,
      start: 1705715264,
      runAtCurrTime: true,
    },
  },
};
