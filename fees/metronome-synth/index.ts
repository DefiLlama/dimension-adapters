import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const TREASURY = {
  [CHAIN.ETHEREUM]: [
    "0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33",
    "0xb3983cDdBa4B127960A4cDD531AB989264509e23",
    "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
    "0xf9eeb67238dfb16e6bbf14ab560d18b740f820a9",
  ],
  [CHAIN.BASE]: [
    "0xe01df4ac1e1e57266900e62c37f12c986495A618",
    "0xb3983cDdBa4B127960A4cDD531AB989264509e23",
    "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
    "0x3b06d40f1a7ad2d936b5f11a161e84dd637945b6",
  ],
  [CHAIN.OPTIMISM]: [
    "0xE01Df4ac1E1e57266900E62C37F12C986495A618",
    "0xb3983cDdBa4B127960A4cDD531AB989264509e23",
    "0x91ecadb8ef5dacc6156ffc036acf6295eab7a545",
    "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
  ],
};

const REVENUE_TREASURY = {
  [CHAIN.ETHEREUM]: ["0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33"],
  [CHAIN.BASE]: ["0xe01df4ac1e1e57266900e62c37f12c986495A618"],
  [CHAIN.OPTIMISM]: ["0xE01Df4ac1E1e57266900E62C37F12C986495A618"],
}

// fee harvesters (earn rewards, then forward them on-chain)
const FEE_HARVESTERS = {
  [CHAIN.ETHEREUM]: ["0xCE3187216B39ED222319D877956aC6b2eF1961E9"],
  [CHAIN.BASE]: ["0x3b06d40f1a7ad2d936b5f11a161e84dd637945b6"],
  [CHAIN.OPTIMISM]: ["0x91ecadb8ef5dacc6156ffc036acf6295eab7a545"],
}

const SYNTHS = {
  [CHAIN.ETHEREUM]: [
    "0x8b4F8aD3801B4015Dea6DA1D36f063Cbf4e231c7",
    "0xab5eB14c09D416F0aC63661E57EDB7AEcDb9BEfA",
    "0x64351fC9810aDAd17A690E4e1717Df5e7e085160",
    ADDRESSES.ethereum.CRV,
    "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3", // OETH
    ADDRESSES.ethereum.FXN,
  ],
  [CHAIN.BASE]: [
    "0x7Ba6F01772924a82D9626c126347A28299E98c98",
    "0x526728DBc96689597F85ae4cd716d4f7fCcBAE9d",
    "0x940181a94A35A4569E4529A3CDfB74e38FD98631", // AERO
  ],
  [CHAIN.OPTIMISM]: [
    "0x1610e3c85dd44Af31eD7f33a63642012Dca0C5A5",
    "0x9dAbAE7274D28A45F0B65Bf8ED201A5731492ca0",
    "0x33bCa143d9b41322479E8d26072a00a352404721",
    "0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404", // KITE
    "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", // VELO
  ],
};

const VAULTS = {
  [CHAIN.ETHEREUM]: [
    {
      vault: "0xCa7c607C590ad16007CCBbba9D26f4df656a36C2",
      holder: "0x82ed3fc9d93112124b04b6c7b35394a5aba8af39",
      underlying: "ethereum:" + ADDRESSES.GAS_TOKEN_2,
    },
    {
      vault: "0x4C73F025a1947ec770327B9956Fc61f535F72C22",
      holder: "0x82ed3fc9d93112124b04b6c7b35394a5aba8af39",
      underlying: "ethereum:" + ADDRESSES.ethereum.USDC,
    },
  ],
  [CHAIN.BASE]: [
    {
      vault: "0x913Ece180df83A2B81A4976F83cA88543a0C51b8",
      holder: "0xdb9bd9eb1cdd9ae62a2e9569075a5154296cd632",
      underlying: "base:" + ADDRESSES.GAS_TOKEN_2,
    },
  ],
};

const MET_TOKEN = "0x2Ebd53d035150f328bd754D6DC66B99B0eDB89aa";
const DISTRIBUTOR = "0x33f081a0f0240d0ed7e45c36848c01d7ad8038e9";

function getFromAddr(log: any): string | null {
  if (typeof log?.from === 'string') return log.from.toLowerCase()
  if (typeof log?.args?.from === 'string') return log.args.from.toLowerCase()
  if (typeof log?._from === 'string') return log._from.toLowerCase()
  const t = log?.topics
  if (Array.isArray(t) && typeof t[1] === 'string' && t[1].length >= 66)
    return ('0x' + t[1].slice(26)).toLowerCase()
  return null
}

function getToAddr(log: any): string | null {
  if (typeof log?.to === 'string') return log.to.toLowerCase()
  if (typeof log?.args?.to === 'string') return log.args.to.toLowerCase()
  if (typeof log?._to === 'string') return log._to.toLowerCase()
  const t = log?.topics
  if (Array.isArray(t) && typeof t[2] === 'string' && t[2].length >= 66)
    return ('0x' + t[2].slice(26)).toLowerCase()
  return null
}

const fetch = async (options: FetchOptions) => {
  const chain = options.chain;
  const treasurySenders = new Set(TREASURY[chain].map(a => a.toLowerCase()))
  const revenueTargets = REVENUE_TREASURY[chain].map(a => a.toLowerCase())
  const harvesters = new Set((FEE_HARVESTERS[chain] ?? []).map(a => a.toLowerCase()))

  const dailyFees = await addTokensReceived({
    options,
    tokens: SYNTHS[chain],
    targets: revenueTargets.concat(FEE_HARVESTERS[chain] ?? []), // count inflows to both revenue treasuries & harvesters
    logFilter: (log) => {
      const from = getFromAddr(log)
      const to = getToAddr(log)
      if (!from) return true

      if (treasurySenders.has(from)) return false

      if (harvesters.has(from) && treasurySenders.has(to ?? "")) return false

      return true
    },
  });

  const dailyHoldersRevenue = options.createBalances();

  const vaults = VAULTS[chain] ?? [];
  for (const v of vaults) {
    const [pps0, pps1, sharesRaw] = await Promise.all([
      options.fromApi.call({ abi: "uint256:pricePerShare", target: v.vault }),
      options.toApi.call({ abi: "uint256:pricePerShare", target: v.vault }),
      options.toApi.call({ abi: "erc20:balanceOf", target: v.vault, params: [v.holder] }),
    ]);

    const delta = BigInt(pps1.toString()) - BigInt(pps0.toString());
    if (delta <= 0n) continue;

    const shares = BigInt(sharesRaw.toString());
    const gainRaw = (delta * shares) / 10n ** 18n;
    if (gainRaw <= 0n) continue;

    dailyFees.add(v.underlying, gainRaw);
  }

  if (chain === CHAIN.ETHEREUM) {
    const metTransfers = await addTokensReceived({
      options,
      tokens: [MET_TOKEN],
      targets: [DISTRIBUTOR],
    });
    dailyHoldersRevenue.addBalances(metTransfers);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-05-11' },
    [CHAIN.BASE]: { start: '2023-05-11' },
    [CHAIN.OPTIMISM]: { start: '2023-05-11' },
  },
  methodology: {
    Fees: "synth/reward inflows to treasury.",
    Revenue: "Fees plus vault interest.",
    HoldersRevenue: "MET distributed to esMET lockers.",
  },
};

export default adapter;