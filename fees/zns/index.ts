import { ethers } from "ethers";
import type { Balances } from "@defillama/sdk";

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi_event = {
  mintedDomain:
    "event MintedDomain(string domainName, uint256 indexed tokenId, address indexed owner, uint256 expiry)",
  renewedDomain:
    "event RenewedDomain(uint256 indexed tokenId, uint256 expiry, string domainName)",
};

const addresses = {
  [CHAIN.BSC]: "0x7e2cf06f092c9f5cf5972ef021635b6c8e1c5bb2",
  [CHAIN.SCROLL]: "0xB00910Bac7DA44c0D440798809dbF8d51FDBb635",
  [CHAIN.BLAST]: "0x59B9Ac688e39A14b938AC8C3269db66D8aDB9aF6",
  [CHAIN.POLYGON]: "0x8ccD9c0A9C084412416A85Fd748c7f1E9b86442D",
  [CHAIN.TAIKO]: "0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5",
  [CHAIN.XLAYER]: "0x71709a5f1831ba48c414375fb6a58662a40c01b5",
  [CHAIN.ZORA]: "0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D",
  [CHAIN.BOBA]: "0xf1D09DA87c50820eD3b924aFf3C37058eD6eA40e",
};

const rpcUrls = {
  [CHAIN.BSC]: "https://binance.llamarpc.com",
  [CHAIN.SCROLL]: "https://1rpc.io/scroll",
  [CHAIN.BLAST]: "https://blast-rpc.publicnode.com",
  [CHAIN.POLYGON]: "https://polygon.llamarpc.com",
  [CHAIN.TAIKO]: "https://rpc.ankr.com/taiko",
  [CHAIN.XLAYER]: "https://endpoints.omniatech.io/v1/xlayer/mainnet/public",
  [CHAIN.ZORA]: "https://rpc.zora.energy",
  [CHAIN.BOBA]: "https://mainnet.boba.network/",
};

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
};

const ABI = [
  {
    inputs: [{ internalType: "uint16", name: "len", type: "uint16" }],
    name: "priceToRegister",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const fetchLogsAndCalculateFees = async (
  options: FetchOptions,
  chain: string
): Promise<{ dailyFees: Balances; dailyRevenue: Balances }> => {
  const address = addresses[chain];
  const dailyFees = options.createBalances();

  const rpcUrl = rpcUrls[chain];
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(address, ABI, provider);

  const mintedLogs = await options.getLogs({
    targets: [address],
    eventAbi: abi_event.mintedDomain,
  });

  const renewedLogs = await options.getLogs({
    targets: [address],
    eventAbi: abi_event.renewedDomain,
  });

  for (const log of mintedLogs.concat(renewedLogs)) {
    const domainPrice = await contract.priceToRegister(log.domainName.length);
    dailyFees.addGasToken(domainPrice);
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.BSC),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.SCROLL]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.POLYGON),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.BLAST]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.BOBA),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.POLYGON]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.POLYGON),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.TAIKO]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.BOBA),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.XLAYER]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.BSC),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.ZORA]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.POLYGON),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.BOBA]: {
      fetch: (options: FetchOptions) =>
        fetchLogsAndCalculateFees(options, CHAIN.BOBA),
      start: 1714506194,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
