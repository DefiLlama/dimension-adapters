import type { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abi_event = {
  mintedDomain: "event MintedDomain(string domainName,uint256 indexed tokenId,address indexed owner,uint256 indexed expiry)",
  renewedDomain: "event RenewedDomain(uint256 indexed tokenId,uint256 indexed expiry,string domainName)",
};

type TAddress = {
  [s: string]: string;
};
const addresses: TAddress = {
  [CHAIN.BSC]: "0x7e2cf06f092c9f5cf5972ef021635b6c8e1c5bb2",
  [CHAIN.SCROLL]: "0xB00910Bac7DA44c0D440798809dbF8d51FDBb635",
  [CHAIN.BLAST]: "0x59B9Ac688e39A14b938AC8C3269db66D8aDB9aF6",
  [CHAIN.POLYGON]: "0x8ccD9c0A9C084412416A85Fd748c7f1E9b86442D",
  [CHAIN.TAIKO]: "0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5",
  [CHAIN.XLAYER]: "0x71709a5f1831ba48c414375fb6a58662a40c01b5",
  [CHAIN.ZORA]: "0xf180136DdC9e4F8c9b5A9FE59e2b1f07265C5D4D",
  [CHAIN.BOBA]: "0xf1D09DA87c50820eD3b924aFf3C37058eD6eA40e",
  [CHAIN.ZKLINK]: "0xe0971a2B6E34bd060866081aE879630e83C4A0BD",
};

const methodology = {
  Fees: "registration and renew cost",
  Revenue: "registration and renew cost",
};

const ABI = {
  priceToRegister: {
    inputs: [{ internalType: "uint16", name: "len", type: "uint16" }],
    name: "priceToRegister",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  priceToRenew: {
    inputs: [{ internalType: "uint16", name: "len", type: "uint16" }],
    name: "priceToRenew",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
}

const fetchLogsAndCalculateFees = async (
  options: FetchOptions,
): Promise<{ dailyFees: Balances; dailyRevenue: Balances }> => {
  const address = addresses[options.chain];
  const dailyFees = options.createBalances();

  const mintedLogs = await options.getLogs({
    target: address,
    eventAbi: abi_event.mintedDomain,
  });

  const renewedLogs = await options.getLogs({
    target: address,
    eventAbi: abi_event.renewedDomain,
  });
  const lens = [1,2,3,4,5]

  const znsPriceRegistor = await options.api.multiCall({
    abi: ABI.priceToRegister,
    calls: lens.map(len=>({
      params: [len],
      target: address
    }))
  });

  const znsPriceRenew = await options.api.multiCall({
    abi: ABI.priceToRenew,
    calls: lens.map(len=>({
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
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1714506194,
      meta: {
        methodology,
      },
    },
    [CHAIN.SCROLL]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1714773760,
      meta: {
        methodology,
      },
    },
    [CHAIN.BLAST]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1717180581,
      meta: {
        methodology,
      },
    },
    [CHAIN.POLYGON]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1717195742,
      meta: {
        methodology,
      },
    },
    [CHAIN.TAIKO]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1717048139,
      meta: {
        methodology,
      },
    },
    [CHAIN.XLAYER]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1713379405,
      meta: {
        methodology,
      },
    },
    [CHAIN.ZORA]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1719239283,
      meta: {
        methodology,
      },
    },
    [CHAIN.BOBA]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1719631449,
      meta: {
        methodology,
      },
    },
    [CHAIN.ZKLINK]: {
      fetch: fetchLogsAndCalculateFees,
      start: 1719631449,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
