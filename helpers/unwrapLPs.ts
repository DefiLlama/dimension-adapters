import * as sdk from "@defillama/sdk";

export async function sumTokens2({ chain, block, tokensAndOwners }: {
  chain: string;
  block: number;
  tokensAndOwners: [string, string][];
}) {
  const balances = {};
  await sdk.util.sumTokens({
    chain,
    block,
    ownerTokens: tokensAndOwners.map(([token, owner]) => [token, owner]),
    balances,
  });
  return balances;
}
