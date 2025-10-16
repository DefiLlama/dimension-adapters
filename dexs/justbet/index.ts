import { ethers } from "ethers";

import abis from "./abis";
import { CHAIN } from "../../helpers/chains";
import { Adapter } from "../../adapters/types";
import { receiptDecode, extractReceiptHashes } from "./helpers";
import {
  JUSTBET_BANKROLL_INDEXES,
  GAME_LOG_EMITTER_ADDRESS,
  WINR_VAULT_ADAPTER_CONTRACT,
} from "./constants";

export default {
  adapter: {
    [CHAIN.WINR]: {
      fetch: async ({ api, getLogs }) => {
        const vaultCurrentPrices = await api.multiCall({
          abi: abis.returnBankrollTokenInfoByAddress,
          calls: JUSTBET_BANKROLL_INDEXES as any,
          target: WINR_VAULT_ADAPTER_CONTRACT,
          permitFailure: true,
        });

        const currentPrices = vaultCurrentPrices
          .map((vault) => {
            if (!vault) {
              return;
            }

            return {
              tokenAddress: vault[1],
              name: vault[2],
              symbol: vault[3],
              decimals: vault[4],
              totalAmount: vault[5],
              priceInUSD: vault[6],
              assetRatio: vault[7],
              totalAmountInUsd: vault[8],
            };
          })
          .filter(Boolean);

        const getDailyVolume = async () => {
          let dailyVolume = 0;
          const logs = await getLogs({
            target: GAME_LOG_EMITTER_ADDRESS,
            eventAbi: abis.logEvent,
          });

          const receipts = [];
          logs.forEach((log: any) => {
            receipts.push(...extractReceiptHashes(log[2][0][0]));
          });

          const receiptsDecoded = receipts.map((receipt) =>
            receiptDecode(receipt)
          );

          receiptsDecoded.forEach((receipt) => {
            const price = currentPrices.find(
              (price) => price.tokenAddress === receipt.token
            );

            if (!price) {
              return;
            }

            const vaultDecimal = Number(price.decimals);
            const vaultCurrentPrice = Number(
              ethers.formatUnits(price.priceInUSD, 8)
            );

            const totalVolumeUSD =
              receipt.payin > receipt.payout
                ? Number(ethers.formatUnits(receipt.payin, vaultDecimal)) *
                  vaultCurrentPrice
                : Number(ethers.formatUnits(receipt.payout, vaultDecimal)) *
                  vaultCurrentPrice;

            dailyVolume += totalVolumeUSD;
          });

          return dailyVolume;
        };

        const [dailyVolume] = await Promise.all([
          getDailyVolume(),
        ]);

        return { dailyVolume };
      },
      start: '2024-11-20',
    },
  },
  version: 2,
} as Adapter;
