import axios from "axios";
import { getEnv } from "./env";

export async function getTokenSupply(token: string) {
  const tokenSupply = await axios.post(getEnv('SOLANA_RPC'), {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenSupply",
    params: [token],
  });
  return tokenSupply.data.result.value.uiAmount;
}

export async function getTokenBalance(token: string, account: string) {
  const tokenBalance = await axios.post(getEnv('SOLANA_RPC'), {
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
