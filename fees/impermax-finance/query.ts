import { gql } from "graphql-request";

// GraphQL query
export const query = gql`
  {
    borrowables {
      id
      totalBalance
      totalBorrows
      reserveFactor
      borrowRate
      accrualTimestamp
      underlying {
        id
        name
        symbol
        decimals
      }
      lendingPool {
        id
      }
    }
  }
`;

