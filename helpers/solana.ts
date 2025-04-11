import axios from "axios";

export const endpoint = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";

export async function getTokenSupply(token: string) {
  const tokenSupply = await axios.post(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenSupply",
    params: [token],
  });
  return tokenSupply.data.result.value.uiAmount;
}

export async function getTokenBalance(token: string, account: string) {
  const tokenBalance = await axios.post(endpoint, {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [
      account,
      {
        mint: token,
      },
      {
        encoding: "jsonParsed",
      },
    ],
  });
  return tokenBalance.data.result.value.reduce(
    (total: number, account: any) =>
      total + account.account.data.parsed.info.tokenAmount.uiAmount,
    0
  );
}
