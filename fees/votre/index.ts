import { Adapter, FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";

const BASE_MAINNET_SUBGRAPH_URL =
  "https://api.goldsky.com/api/public/project_cm3exke617zqh01074tulgtx0/subgraphs/collar-base-mainnet/0.1.2/gn";

const fetch = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const query = gql`
    query Fees($from: Int!, $to: Int!) {
      loans(where: { createdAt_gte: $from, createdAt_lt: $to }) {
        feesPaid
        interestAccrued
        loansNFT {
          underlying
        }
      }
    }
  `;

  const data = await request(BASE_MAINNET_SUBGRAPH_URL, query, {
    from: fromTimestamp,
    to: toTimestamp,
  });

  for (const loan of data.loans) {
    const underlying = loan.loansNFT?.underlying;
    if (!underlying) continue;

    const totalFees = BigInt(loan.feesPaid) + BigInt(loan.interestAccrued);
    const protocolShare = (totalFees * 20n) / 100n;
    const supplySideShare = totalFees - protocolShare;

    dailyFees.add(underlying, totalFees.toString());
    dailyProtocolRevenue.add(underlying, protocolShare.toString());
    dailySupplySideRevenue.add(underlying, supplySideShare.toString());
  }

  return {
    dailyFees: dailyFees.getBalances(),
    dailyProtocolRevenue: dailyProtocolRevenue.getBalances(),
    dailySupplySideRevenue: dailySupplySideRevenue.getBalances(),
  };
};

const adapter: Adapter = {
  adapter: {
    base: {
      fetch,
      start: 1714608000,
      meta: {
        methodology:
          "Revenue and fees include all fees paid and interest accrued on loans. Example split: 20% protocol, 80% supply side.",
      },
    },
  },
};

export default adapter;
