import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const TREASURY = {
  [CHAIN.ETHEREUM]: "0xd1de3f9cd4ae2f23da941a67ca4c739f8dd9af33",
  [CHAIN.BASE]:     "0xe01df4ac1e1e57266900e62c37f12c986495a618",
  [CHAIN.OPTIMISM]: "0xE01Df4ac1E1e57266900E62C37F12C986495A618",
};

const SYNTHS = {
  [CHAIN.ETHEREUM]: [
    "0x8b4F8aD3801B4015Dea6DA1D36f063Cbf4e231c7",
    "0xab5eB14c09D416F0aC63661E57EDB7AEcDb9BEfA",
    "0x64351fC9810aDAd17A690E4e1717Df5e7e085160",
  ],
  [CHAIN.BASE]: [
    "0x7Ba6F01772924a82D9626c126347A28299E98c98",
    "0x526728DBc96689597F85ae4cd716d4f7fCcBAE9d",
  ],
  [CHAIN.OPTIMISM]: [
    "0x1610e3c85dd44Af31eD7f33a63642012Dca0C5A5",
    "0x9dAbAE7274D28A45F0B65Bf8ED201A5731492ca0",
    "0x33bCa143d9b41322479E8d26072a00a352404721",
  ],
};

const EXTRA_INFLOWS: Record<string, Array<{ target: string; tokens: string[]; fromAddressFilter?: string }>> = {
  [CHAIN.OPTIMISM]: [
    {
      target: "0x91ecADB8EF5DACc6156fFC036aCF6295eAb7A545",
      tokens: [
        "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", // VELO
        "0xf467C7d5a4A9C4687fFc7986aC6aD5A4c81E1404", // KITE
      ],
    },
    {
      target: "0xb3983cDdBa4B127960A4cDD531AB989264509e23",
      tokens: [
        "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", // VELO
      ],
      fromAddressFilter: "0x7DD72EF1f023ac5c2F4Cedcb278f4bfb2Bb60CbE",
    },
  ],
  [CHAIN.BASE]: [
    {
      target: "0x3b06D40f1a7AD2D936B5F11A161e84DD637945B6",
      tokens: [
        "0x940181a94A35A4569E4529A3CDfB74e38FD98631", // AERO
      ],
    },
    {
      target: "0x3b06D40f1a7AD2D936B5F11A161e84DD637945B6",
      tokens: [
        "0x526728DBc96689597F85ae4cd716d4f7fCcBAE9d", // msUSD
        "0x7Ba6F01772924a82D9626c126347A28299E98c98", // msETH
      ],
      fromAddressFilter: "0x8845126640B36df1D24bf3dF9B2903fD4c730FE6",
    },
  ],
  [CHAIN.ETHEREUM]: [
    {
      target: "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
      tokens: [
        "0xD533a949740bb3306d119CC777fa900bA034cd52", // CRV
        "0x856c4Efb76C1D1AE02e20CEB03A2A6a08b0b8dC3", // OETH
        "0x365accfca291e7d3914637abf1f7635db165bb09", // FXN
      ],
    },
  ],
  [CHAIN.PLASMA]: [
    {
      target: "0xCE3187216B39ED222319D877956aC6b2eF1961E9",
      tokens: [
        "0x29AD7fE4516909b9e498B5a65339e54791293234", // msUSD
        "0x7230a9D42D622E18FDf7207041EcA18465F9F1bE", // msETH
      ],
      fromAddressFilter: "0xf94EA39c02DfF32494FBaFcF72E546c640143D7D",
    },
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

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  if (TREASURY[options.chain]) {
    const synthFees = await addTokensReceived({
      options,
      tokens: SYNTHS[options.chain],
      targets: [TREASURY[options.chain]],
    });
    dailyFees.addBalances(synthFees);
  }

  for (const group of (EXTRA_INFLOWS[options.chain] ?? [])) {
    const params: any = {
      options,
      tokens: group.tokens,
      targets: [group.target],
    };
    if (group.fromAddressFilter) {
      params.fromAddressFilter = group.fromAddressFilter;
    }
    const res = await addTokensReceived(params);
    dailyFees.addBalances(res);
  }

  const vaults = VAULTS[options.chain] ?? [];
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

  const dailyHoldersRevenue = options.createBalances();
  if (options.chain === CHAIN.ETHEREUM) {
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
  pullHourly: true,
  methodology: {
    Fees: "Inflows to the main treasury.",
    Revenue: "Same as Fees.",
    HoldersRevenue: "MET inflows to the distributor contract.",
  },
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2023-05-11',
    },
    [CHAIN.BASE]: {
      start: '2023-05-11',
    },
    [CHAIN.OPTIMISM]: {
      start: '2023-05-11',
    },
    [CHAIN.PLASMA]: {
      start: '2025-09-29',
    },
  },
};

export default adapter;
