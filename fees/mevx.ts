import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

// From its first transaction (2026-05-28 06:19 UTC) to 2026-07-14 ~10:00 UTC the per-swap SOL fee went to this wallet
// instead of 3kxSQy...; after that it only gets occasional plain transfers, which are not swap fees
const FEE_WALLET_2026 = '4DGMLhJqTBAB9xs1FodvXrfbdo5YqPSfDRaK1KZFXd1V';
const FEE_WALLET_2026_END = 1784073600; // 2026-07-15 00:00 UTC

const fetch: any = async (options: FetchOptions) => {
  const targets = [
    "3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A",
    "BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ",
    "4Lpvp1q69SHentfYcMBUrkgvppeEx6ovHCSYjg4UYXiq"
  ];
  if (options.startTimestamp < FEE_WALLET_2026_END) targets.push(FEE_WALLET_2026);

  const dailyFees = await getSolanaReceived({
    // FEE_WALLET_2026 excluded as sender and signer: its own SOL to USDC swaps and moves between MevX wallets are not fees
    blacklists: ['3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A', 'BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ', FEE_WALLET_2026],
    blacklist_signers: ['3kxSQybWEeQZsMuNWMRJH4TxrhwoDwfv41TNMLRzFP5A', 'BS3CyJ9rRC4Tp8G7f86r6hGvuu3XdrVGNVpbNM9U5WRZ', FEE_WALLET_2026],
    options,
    targets,
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: '2024-07-27',
    },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using Mevx bot.",
    Revenue: "Trading fees are collected by Mevx protocol.",
    ProtocolRevenue: "Trading fees are collected by Mevx protocol.",
  }
};

export default adapter;
