import axios from "axios";

const shadowSubgraph =
  "https://shadow.kingdomsubgraph.com/subgraphs/name/core-full";

const query = (block: number, pool: string) => `
  query {
  legacyPools(where: {id:"${pool}"}, block: {number: ${block}}) {
    id,
    totalValueLockedToken0,
    totalValueLockedToken1,
    totalSupply,
    token0 {
      id
		}
    token1 {
      id
    }
  }
}
`;

/**
 * @param query - The query to execute
 * @returns The response from the subgraph
 */
const subgraph = async (query: string) => {
  const response = await axios.post(shadowSubgraph, {
    query,
  });
  return response.data.data;
};

/**
 * Helper function to get the fees for a pool from the shadow subgraph
 * @param startBlock - The start block
 * @param endBlock - The end block
 * @param pool - The pool address
 * @returns The fees for the pool
 */
export const getFees = async (
  startBlock: number,
  endBlock: number,
  pool: string
) => {
  const beforeState = await subgraph(query(startBlock, pool));
  const afterState = await subgraph(query(endBlock, pool));

  const beforePool = beforeState.legacyPools[0];
  const afterPool = afterState.legacyPools[0];

  const token0 = beforePool.token0.id;
  const token1 = beforePool.token1.id;

  const beforeTotalSupply = Number(beforePool.totalSupply);
  const afterTotalSupply = Number(afterPool.totalSupply);

  // Calculate k values
  const beforeKValue = Math.sqrt(
    Number(beforePool.totalValueLockedToken0) *
      Number(beforePool.totalValueLockedToken1)
  );
  const afterKValue = Math.sqrt(
    Number(afterPool.totalValueLockedToken0) *
      Number(afterPool.totalValueLockedToken1)
  );

  // Calculate k value per LP token (normalized by total supply)
  const beforeKPerLP = beforeKValue / beforeTotalSupply;
  const afterKPerLP = afterKValue / afterTotalSupply;

  // The growth in k value per LP token represents pure fee growth
  // This removes the effect of liquidity changes
  const kValueGrowthPerLP = afterKPerLP - beforeKPerLP;

  // Calculate fee ratio based on k value growth per LP
  const feeRatio = kValueGrowthPerLP / beforeKPerLP;

  // Calculate fees in terms of the pool's tokens
  const token0Fees = Number(beforePool.totalValueLockedToken0) * feeRatio;
  const token1Fees = Number(beforePool.totalValueLockedToken1) * feeRatio;

  return {
    token0: {
      token: token0,
      fees: token0Fees,
    },
    token1: {
      token: token1,
      fees: token1Fees,
    },
  };
};
