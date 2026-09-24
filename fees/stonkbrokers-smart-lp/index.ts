import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * StonkBrokers Smart LP (Volatility Farming) — immutable concentrated-liquidity
 * vaults on canonical Uniswap V3 pools on Robinhood Chain (live 2026-09-08).
 * The on-chain registry is the single discovery surface for the fleet. Every
 * fee collection emits FeesCollected on the vault: fees0/fees1 = gross pool
 * fees collected, skim0/skim1 = the 10% performance fee, which splits 50%
 * StockBooster (Clock In dividends) / 50% $STONKBROKER buybacks. The remaining
 * 90% auto-compounds back into the vault position for depositors.
 */
const SMART_LP_REGISTRY = "0xE8749183Fbf6A657EB58B3a4D3E4B9Cc09560146";

const SMART_LP_FEES_COLLECTED = "event FeesCollected(uint256 fees0, uint256 fees1, uint256 skim0, uint256 skim1)";

const LABELS = {
  SMARTLP_FEES: "Smart LP vault pool fees (Volatility Farming)",
  SMARTLP_COMPOUND: "Smart LP fees auto-compounded to vault depositors (90%)",
  SMARTLP_DIVIDENDS: "Smart LP performance fee → StockBooster Clock In dividends (5%)",
  SMARTLP_BUYBACK: "Smart LP performance fee → $STONKBROKER buybacks (5%)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Registry-enumerated fleet (the registry is the only discovery surface).
  // flatten:false so each vault's logs attribute to its own token0/token1 pair.
  const vaults: string[] = await options.api.call({ abi: "address[]:all", target: SMART_LP_REGISTRY });
  const feeLogsByVault: any[][] = vaults.length
    ? await options.getLogs({ targets: vaults, eventAbi: SMART_LP_FEES_COLLECTED, flatten: false })
    : [];

  const activeIdx: number[] = [];
  feeLogsByVault.forEach((logs, i) => {
    if (logs?.length) activeIdx.push(i);
  });
  if (activeIdx.length) {
    const [token0s, token1s] = await Promise.all([
      options.api.multiCall({ abi: "address:token0", calls: activeIdx.map((i) => vaults[i]) }),
      options.api.multiCall({ abi: "address:token1", calls: activeIdx.map((i) => vaults[i]) }),
    ]);
    activeIdx.forEach((vaultIdx, j) => {
      const pair: [string, string] = [token0s[j], token1s[j]];
      for (const log of feeLogsByVault[vaultIdx]) {
        const legs: [string, bigint, bigint][] = [
          [pair[0], BigInt(log.fees0), BigInt(log.skim0)],
          [pair[1], BigInt(log.fees1), BigInt(log.skim1)],
        ];
        for (const [token, fees, skim] of legs) {
          if (fees <= 0n) continue;
          const buyback = skim / 2n;
          const dividends = skim - buyback;
          dailyFees.addToken(token, fees, LABELS.SMARTLP_FEES);
          dailySupplySideRevenue.addToken(token, fees - skim, LABELS.SMARTLP_COMPOUND);
          if (dividends > 0n) dailySupplySideRevenue.addToken(token, dividends, LABELS.SMARTLP_DIVIDENDS);
          if (buyback > 0n) {
            dailyHoldersRevenue.addToken(token, buyback, LABELS.SMARTLP_BUYBACK);
            dailyRevenue.addToken(token, buyback, LABELS.SMARTLP_BUYBACK);
          }
        }
      }
    });
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-08",
  doublecounted: true,
  methodology: {
    Fees: "Gross Uniswap V3 pool fees collected by every registry-listed Smart LP (Volatility Farming) vault (FeesCollected fees0/fees1).",
    Revenue: "The $STONKBROKER-buyback half of the 10% performance fee.",
    HoldersRevenue: "The $STONKBROKER-buyback half of the 10% performance fee.",
    SupplySideRevenue:
      "90% of vault pool fees auto-compounded to depositors plus the StockBooster Clock In dividend half of the 10% performance fee.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.SMARTLP_FEES]:
        "Gross Uniswap V3 pool fees collected by every registry-listed Smart LP vault (SmartLpVault FeesCollected fees0/fees1).",
    },
    Revenue: {
      [LABELS.SMARTLP_BUYBACK]: "Half of the Smart LP 10% performance fee → $STONKBROKER buybacks.",
    },
    HoldersRevenue: {
      [LABELS.SMARTLP_BUYBACK]: "Half of the Smart LP 10% performance fee → $STONKBROKER buybacks.",
    },
    SupplySideRevenue: {
      [LABELS.SMARTLP_COMPOUND]: "90% of Smart LP vault pool fees auto-compounded back into the vault's position for depositors.",
      [LABELS.SMARTLP_DIVIDENDS]: "Half of the Smart LP 10% performance fee → StockBooster Clock In dividends to activated brokers.",
    },
  },
};

export default adapter;
