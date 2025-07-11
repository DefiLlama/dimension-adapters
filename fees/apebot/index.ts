import { FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import axios from "axios";

const JUPITER_V6_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const FEE_WALLET = "Bkfx4XwD9VuztHyimbKyte2zkv78eBRHyeq4CvG6RFdB";
const WSOL_ADDRESS = "So11111111111111111111111111111111111111112";
const HIST_START = 1672531200;

const fetch = async (o: FetchOptions): Promise<FetchResultFees> => {
  try {
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (!heliusApiKey) throw new Error("Missing HELIUS_API_KEY");
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;

    let totalFees = new BigNumber(0);
    let before: string | undefined = undefined;
    let hasMore = true;
    const startMs = o.startTimestamp * 1000;
    const endMs = o.endTimestamp * 1000;

    while (hasMore) {
      const sigResp = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "getSignaturesForAddress",
        id: 1,
        params: [FEE_WALLET, { limit: 1000, before }],
      });
      const signatures = sigResp.data.result;

      if (!signatures || signatures.length === 0) {
        hasMore = false;
        break;
      }

      for (const sig of signatures) {
        if (sig.blockTime * 1000 < startMs) {
          hasMore = false;
          break;
        }
        if (sig.blockTime * 1000 > endMs) continue;

        try {
          const txResp = await axios.post(rpcUrl, {
            jsonrpc: "2.0",
            method: "getTransaction",
            id: 1,
            params: [
              sig.signature,
              { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
            ],
          });
          const tx = txResp.data.result;

          if (tx && tx.meta && tx.transaction && tx.transaction.message) {
            const message = tx.transaction.message;
            const meta = tx.meta;
            const involvesJupiter = message.accountKeys.some(
              (key: any) => key.pubkey.toString() === JUPITER_V6_PROGRAM_ID
            );

            if (involvesJupiter) {
              const preBalanceSOL =
                meta.preBalances[
                  message.accountKeys.findIndex(
                    (key: any) => key.pubkey === FEE_WALLET
                  )
                ];
              const postBalanceSOL =
                meta.postBalances[
                  message.accountKeys.findIndex(
                    (key: any) => key.pubkey === FEE_WALLET
                  )
                ];
              if (preBalanceSOL !== undefined && postBalanceSOL !== undefined) {
                const feeAmount = new BigNumber(postBalanceSOL).minus(
                  new BigNumber(preBalanceSOL)
                );
                if (feeAmount.isPositive()) {
                  totalFees = totalFees.plus(feeAmount);
                }
              }

              if (meta.postTokenBalances && meta.preTokenBalances) {
                const preBalance = meta.preTokenBalances.find(
                  (bal: any) =>
                    bal.mint === WSOL_ADDRESS && bal.owner === FEE_WALLET
                );
                const postBalance = meta.postTokenBalances.find(
                  (bal: any) =>
                    bal.mint === WSOL_ADDRESS && bal.owner === FEE_WALLET
                );
                if (preBalance && postBalance) {
                  const feeAmount = new BigNumber(
                    postBalance.uiTokenAmount.amount
                  ).minus(new BigNumber(preBalance.uiTokenAmount.amount));
                  if (feeAmount.isPositive()) {
                    totalFees = totalFees.plus(feeAmount);
                  }
                }
              }
            }
          }
        } catch (txError) {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      before = signatures[signatures.length - 1].signature;
    }

    const finalFees = new BigNumber(totalFees).div(1e9);

    return {
      dailyFees: finalFees.toString(),
      dailyRevenue: finalFees.toString(),
    };
  } catch (error) {
    throw new Error("Helius query failed, no fee data available.");
  }
};

const adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: HIST_START,
    },
    meta: {
      methodology: {
        Fees: "Fees are calculated by monitoring SOL and wSOL deposits into the designated fee wallet for transactions processed through the Jupiter V6 Program.",
        Revenue: "All collected fees are considered protocol revenue.",
      },
    },
  },
};

export default adapter;
