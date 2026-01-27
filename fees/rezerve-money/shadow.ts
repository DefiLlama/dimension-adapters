import axios from "axios";
import { parseUnits } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { Balances } from "@defillama/sdk";

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
      decimals
		}
    token1 {
      id
      decimals
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
const getFees = async (startBlock: number, endBlock: number, pool: string) => {
  const beforeState = await subgraph(query(startBlock, pool));
  const afterState = await subgraph(query(endBlock, pool));

  const beforePool = beforeState.legacyPools[0];
  const afterPool = afterState.legacyPools[0];

  const token0 = beforePool.token0.id;
  const token1 = beforePool.token1.id;

  const decimals0 = beforePool.token0.decimals;
  const decimals1 = beforePool.token1.decimals;

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
  const token0Fees_wei = (
    Number(beforePool.totalValueLockedToken0) * feeRatio
  ).toFixed(6);
  const token1Fees_wei = (
    Number(beforePool.totalValueLockedToken1) * feeRatio
  ).toFixed(6);

  const token0Fees = parseUnits(token0Fees_wei.toString(), Number(decimals0));
  const token1Fees = parseUnits(token1Fees_wei.toString(), Number(decimals1));

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

/**
 * @param balances - The balances object to add the fees to
 * @param options - The options object to get the from and to blocks
 */
export const fetchFeesFromShadow = async (
  balances: Balances,
  options: FetchOptions
) => {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();

  const usdc_rzr_shadowlp = "0x08c5e3b7533ee819a4d1f66e839d0e8f04ae3d0c"; // Replace with your LP token address

  const fees = await getFees(fromBlock, toBlock, usdc_rzr_shadowlp);
  balances.add(fees.token0.token, fees.token0.fees);
  balances.add(fees.token1.token, fees.token1.fees);

  return balances;
};
