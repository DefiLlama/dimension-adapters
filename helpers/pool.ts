import fetchURL from "../utils/fetchURL";

export interface IYield {
  project: string;
  chain: string;
  pool_old: string;
  underlyingTokens: string[];
};
const yieldPool = "https://yields.llama.fi/poolsOld";

// get top pool from yield.llama
export async function getTopPool(project: string, chain: string): Promise<IYield[]> {
  const poolsCall: IYield[] = (await fetchURL(yieldPool))?.data;
  const poolsData: IYield[] = poolsCall
    .filter((e: IYield) => e.project === project)
    .filter((e: IYield) => e.chain.toLowerCase() === chain.toLowerCase());

  if (poolsData.length === 0) {
    throw new Error(`No top pool found for ${project} on ${chain}`)
  }
  return poolsData as IYield[];
}
