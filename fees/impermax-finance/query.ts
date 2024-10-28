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
        collateral {
          liquidationFee
          liquidationIncentive
          safetyMargin
        }
        pair {
          uniswapV2Factory
          token0 {
            id
            name
            symbol
            decimals
          }
          token1 {
            id
            name
            symbol
            decimals
          }
        }
      }
    }
  }
`;

