import type { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi_event = {
  mintedDomain: "event MintedDomain(string domainName,uint256 indexed tokenId,address indexed owner,uint256 indexed expiry)",
  renewedDomain: "event RenewedDomain(uint256 indexed tokenId,uint256 indexed expiry,string domainName)",
};

const ABI = {
  "priceToRegister": "function priceToRegister(uint16 len) view returns (uint256)",
  "priceToRenew": "function priceToRenew(uint16 len) view returns (uint256)"
}

const addresses: Record<string, string> = {
  [CHAIN.BSC]: "0x7e2cf06f092c9f5cf5972ef021635b6c8e1c5bb2",
  [CHAIN.SCROLL]: "0xB00910Bac7DA44c0D440798809dbF8d51FDBb635",
  [CHAIN.BLAST]: "0x59B9Ac688e39A14b938AC8C3269db66D8aDB9aF6",
  [CHAIN.POLYGON]: "0x8ccD9c0A9C084412416A85Fd748c7f1E9b86442D",
  [CHAIN.TAIKO]: "0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5",
  [CHAIN.XLAYER]: "0x71709a5f1831ba48c414375fb6a58662a40c01b5",
  [CHAIN.ZORA]: "0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D",
  // [CHAIN.BOBA]: "0xf1D09DA87c50820eD3b924aFf3C37058eD6eA40e",
  // [CHAIN.ZKLINK]: "0xe0971a2B6E34bd060866081aE879630e83C4A0BD",
  [CHAIN.SONIC]: "0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5",
  [CHAIN.BASE]: "0x55b867a955e4384bcac03ef7f2e492f68016c152",
  [CHAIN.SONEIUM]: "0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D",
  [CHAIN.INK]: "0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5",
  [CHAIN.ABSTRACT]: '0xe0971a2b6e34bd060866081ae879630e83c4a0bd',
  [CHAIN.PLUME_LEGACY]: '0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D',
  [CHAIN.PLUME]: '0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D',
  [CHAIN.BERACHAIN]: '0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5',
  [CHAIN.UNICHAIN]: '0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D',
  [CHAIN.HEMI]: '0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D'
};

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
};

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const address = addresses[options.chain];
  const dailyFees = options.createBalances();
  if (options.chain === CHAIN.PLUME_LEGACY) {
    return { dailyFees, dailyRevenue: dailyFees };
  }

  const mintedLogs = await options.getLogs({
    target: address,
    eventAbi: abi_event.mintedDomain,
  });

  const renewedLogs = await options.getLogs({
    target: address,
    eventAbi: abi_event.renewedDomain,
  });

  const lens = [1, 2, 3, 4, 5]
  const znsPriceRegistor = await options.api.multiCall({
    abi: ABI.priceToRegister,
    calls: lens.map(len => ({
      params: [len],
      target: address
    }))
  });

  const znsPriceRenew = await options.api.multiCall({
    abi: ABI.priceToRenew,
    calls: lens.map(len => ({
      params: [len],
      target: address
    })),
  });

  mintedLogs.forEach((log) => {
    const domainName = log.domainName;
    let domainPrice = 0;
    if (domainName.length === 1) domainPrice = znsPriceRegistor[0];
    else if (domainName.length === 2) domainPrice = znsPriceRegistor[1];
    else if (domainName.length === 3) domainPrice = znsPriceRegistor[2];
    else if (domainName.length === 4) domainPrice = znsPriceRegistor[3];
    else domainPrice = znsPriceRegistor[4];
    dailyFees.addGasToken(domainPrice);
  });

  renewedLogs.forEach((log) => {
    const domainName = log.domainName;
    let domainPrice = 0;
    if (domainName.length === 1) domainPrice = znsPriceRenew[0];
    else if (domainName.length === 2) domainPrice = znsPriceRenew[1];
    else if (domainName.length === 3) domainPrice = znsPriceRenew[2];
    else if (domainName.length === 4) domainPrice = znsPriceRenew[3];
    else domainPrice = znsPriceRenew[4];
    dailyFees.addGasToken(domainPrice);
  });

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  fetch,
  methodology,
  version: 1,
  adapter: {
    [CHAIN.BSC]: { start: '2024-04-30', },
    [CHAIN.SCROLL]: { start: '2024-05-04', },
    [CHAIN.BLAST]: { start: '2024-05-31', },
    [CHAIN.POLYGON]: { start: '2024-06-01', },
    [CHAIN.TAIKO]: { start: '2024-05-30', },
    // [CHAIN.XLAYER]: {start: '2024-04-17' },
    [CHAIN.ZORA]: { start: '2024-06-24', },
    // [CHAIN.BOBA]: {start: '2024-06-29' },
    // [CHAIN.ZKLINK]: {start: '2024-06-29' },
    [CHAIN.SONIC]: { start: '2024-05-30', },
    [CHAIN.BASE]: { start: '2024-05-30', },
    [CHAIN.SONEIUM]: { start: '2024-06-24', },
    [CHAIN.INK]: { start: '2024-05-30', },
    [CHAIN.ABSTRACT]: { start: '2025-01-27', },
    [CHAIN.PLUME]: { start: '2025-01-27', },
    [CHAIN.PLUME_LEGACY]: { start: '2025-01-20', },
    [CHAIN.BERACHAIN]: { start: '2024-05-30', },
    [CHAIN.UNICHAIN]: { start: '2024-06-24', },
    [CHAIN.HEMI]: { start: '2024-06-24', }
  },
};

export default adapter;
