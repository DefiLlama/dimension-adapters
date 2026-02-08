import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { getVaultsForChain, LYRA_V2_TVL_CHAINS } from "./addresses";

/** ERC20 balanceOf: used because Lyra v2 vaults are Socket-style; TVL = token balance of vault. */
const BALANCE_OF_ABI = "function balanceOf(address account) view returns (uint256)" as const;

/**
 * Lyra v2 / Derive TVL: sum of token balances held by each vault on the current chain.
 * Vaults are Socket-style (hold the underlying token, no totalAssets()); we use
 * token.balanceOf(vault) for each (vault, token) pair.
 */
async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const tvl = options.createBalances();
  const vaults = getVaultsForChain(options.chain);

  if (vaults.length === 0) return { tvl };

  const balances = await options.api.multiCall({
    abi: BALANCE_OF_ABI,
    calls: vaults.map((v) => ({ target: v.token, params: [v.vault] })),
    permitFailure: true,
  });

  let addedCount = 0;
  for (let i = 0; i < vaults.length; i++) {
    const amount = balances[i];
    if (amount != null && amount > 0n) {
      tvl.add(vaults[i].token, amount);
      addedCount++;
    }
  }

  // Log why TVL is 0 for this chain (helps debug chains like 957 Lyra, 999, etc.)
  if (addedCount === 0 && vaults.length > 0) {
    const nullCount = balances.filter((b) => b == null).length;
    const zeroCount = balances.filter((b) => b !== null && b === 0n).length;
    console.log(`[lyra-v2-tvl] ${options.chain}: TVL=0 | vaults=${vaults.length} | balanceOf: null=${nullCount}, zero=${zeroCount}`);
    balances.forEach((b, i) => {
      const status = b == null ? "null" : b === 0n ? "0" : String(b);
      console.log(`  [${i}] vault=${vaults[i].vault} token=${vaults[i].token} => ${status}`);
    });
  }

  return { tvl };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    LYRA_V2_TVL_CHAINS.map((chain) => [
      chain,
      {
        fetch,
        start: "2023-12-15",
      },
    ])
  ) as SimpleAdapter["adapter"],
};

export default adapter;
