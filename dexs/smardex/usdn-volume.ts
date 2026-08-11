import { FetchOptions } from "../../adapters/types";
import { usdnAbi } from "./abis";
import { CONFIG } from "./config";

// Each USDN protocol event contributes some token amount to trading volume.
// `field` is the decoded event field holding that amount, `token` is the asset
// it is denominated in. Amounts are added raw and priced by the SDK.
const getEventConfigs = () => {
  const { USDN, DIP_ACCUMULATOR } = CONFIG.CONTRACTS;
  const { USDN: USDN_TOKEN, WSTETH } = CONFIG.TOKENS;

  return [
    { abi: usdnAbi.vaultDepositEvent, contract: USDN, token: USDN_TOKEN, field: "usdnMinted" },
    { abi: usdnAbi.vaultWithdrawalEvent, contract: USDN, token: USDN_TOKEN, field: "usdnBurned" },
    { abi: usdnAbi.longOpenPositionEvent, contract: USDN, token: WSTETH, field: "totalExpo" },
    { abi: usdnAbi.longClosePositionEvent, contract: USDN, token: WSTETH, field: "amountReceived" },
    { abi: usdnAbi.liquidatedTickEvent, contract: USDN, token: WSTETH, field: "remainingCollateral" },
    { abi: usdnAbi.liquidatorRewarded, contract: USDN, token: WSTETH, field: "rewards" },
    { abi: usdnAbi.rebalancerDepositEvent, contract: DIP_ACCUMULATOR, token: WSTETH, field: "amount" },
    { abi: usdnAbi.rebalancerWithdrawalEvent, contract: DIP_ACCUMULATOR, token: WSTETH, field: "amount" },
  ];
};

// Adds USDN protocol trading volume (in token terms) to `dailyVolume`.
export async function addUsdnVolume(options: FetchOptions, dailyVolume: ReturnType<FetchOptions["createBalances"]>) {
  for (const { abi, contract, token, field } of getEventConfigs()) {
    const logs = await options.getLogs({ target: contract, eventAbi: abi });
    for (const log of logs) {
      // remainingCollateral is an int256 and can be negative; clamp to volume >= 0.
      const value = BigInt(log[field].toString());
      if (value > 0n) dailyVolume.add(token, value);
    }
  }
}
