import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// https://docs.nest.credit
// Nest vaults use the BoringVault architecture on Plume and Ethereum
const methodology = {
  Fees: "Total yields generated from real-world asset strategies in Nest vaults.",
  SupplySideRevenue: "All yields are distributed to vault depositors.",
};

interface IVault {
  vault: string;
  accountant: string;
}

// Vault contracts from https://docs.nest.credit/developers/smart-contracts
const VAULTS: IVault[] = [
  { vault: "0x593cCcA4c4bf58b7526a4C164cEEf4003C6388db", accountant: "0xe0CF451d6E373FF04e8eE3c50340F18AFa6421E1" }, // nAlpha
  { vault: "0xe72fe64840f4ef80e3ec73a1c749491b5c938cb9", accountant: "0x0b738cd187872b265a689e8e4130c336e76892ec" }, // nTBILL
  { vault: "0x9fbC367B9Bb966a2A537989817A088AFCaFFDC4c", accountant: "0xAdB076707AbED7D19E3A75d98E77FCDFa4c15D93" }, // vault 3
  { vault: "0x11113Ff3a60C2450F4b22515cB760417259eE94B", accountant: "0xa67d20A49e6Fe68Cf97E556DB6b2f5DE1dF4dC2f" }, // nBasis
  { vault: "0xbfc5770631641719cd1cf809d8325b146aed19de", accountant: "0xb00bbbd72a377a34eac434226dd3e0e12d12a55b" }, // vault 5
  { vault: "0xa5f78b2a0ab85429d2dfbf8b60abc70f4cec066c", accountant: "0x486e0362b0641c0fca21cac2e317f6e21a8b19f3" }, // nCREDIT
  { vault: "0x2A3e301dbd45c143DFbb7b1CE1C55bf0BBF161cb", accountant: "0xF76bC95969e5Aa32b7b95Bb4caAA1bcbB2dDcAB9" }, // vault 7
  { vault: "0x29bF22381A5811deC89dC7b46A5Ce57aD02c0240", accountant: "0x7D218B7ce9EE5Ee4D500ba048240537b728E0d25" }, // vault 8
  { vault: "0x119Dd7dAFf816f29D7eE47596ae5E4bdC4299165", accountant: "0x2Ed2f77a961fc92F73D1087786099c39C894Ed1D" }, // nOpal
  { vault: "0x1639DcEc3ECE7F610F96a8935db6bCFfBCa2FBFb", accountant: "0x3D649799A16aEfadB3fb1033192182B0F9836b32" }, // vault 10
];

const abis = {
  totalSupply: "uint256:totalSupply",
  decimals: "uint8:decimals",
  base: "address:base",
  exchangeRateUpdated: "event ExchangeRateUpdated(uint96 oldRate, uint96 newRate, uint64 currentTime)",
  getRateInQuoteSafe: "function getRateInQuoteSafe(address quote) view returns (uint256)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const { vault, accountant } of VAULTS) {
    const [totalSupply, decimals, token] = await Promise.all([
      options.api.call({ target: vault, abi: abis.totalSupply, permitFailure: true }),
      options.api.call({ target: vault, abi: abis.decimals, permitFailure: true }),
      options.api.call({ target: accountant, abi: abis.base, permitFailure: true }),
    ]);
    if (!totalSupply || !decimals || !token) continue;
    const vaultRateBase = Number(10 ** Number(decimals));

    // Track yield from exchange rate updates
    const events = await options.getLogs({
      eventAbi: abis.exchangeRateUpdated,
      target: accountant,
    });

    for (const event of events) {
      const oldRate = BigInt(event.oldRate);
      const newRate = BigInt(event.newRate);
      const growthRate = newRate > oldRate ? Number(newRate - oldRate) : 0;
      if (growthRate > 0) {
        const yieldAmount = Number(totalSupply) * growthRate / vaultRateBase;
        dailyFees.add(token, yieldAmount);
        dailySupplySideRevenue.add(token, yieldAmount);
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2025-03-01" },
    [CHAIN.PLUME]: { fetch, start: "2025-03-01" },
  },
};

export default adapter;
