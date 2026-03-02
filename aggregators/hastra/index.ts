import { getSolanaReceived } from "../../helpers/token";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
  // Version 2 uses a unified options object containing createBalances()
  const dailyVolume = options.createBalances();

  await getSolanaReceived({
    options,
    balances: dailyVolume, // You must pass the balances object to be filled
    targets: [
      "FvkbfMm98jefJWrqkvXvsSZ9RFaRBae8k6c1jaYA5vY3", // wYLDS Vault
      "HH1hSzaBKvBDf7GWD1mw557Q8LwBPHHE63WEu6BURS8X", // Redeem Vault
    ],
  });

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2, // Upgrade to version 2 to use the single 'options' argument
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-01-01",
    },
  },
};

export default adapter;
