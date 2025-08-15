import { Chain } from "../adapters/types";
import {
  Adapter,
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
} from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const event0_swap =
  "event Swap(uint16 chainId,uint256 dstPoolId,address from,uint256 amountSD,uint256 eqReward,uint256 eqFee,uint256 protocolFee,uint256 lpFee)";
const event0_swap_remote =
  "event SwapRemote( address to,uint256 amountSD,uint256 protocolFee,uint256 dstFee)";

type IAddress = {
  [s: string | Chain]: string[];
};

const contract_address: IAddress = {
  [CHAIN.ETHEREUM]: [
    "0x101816545f6bd2b1076434b54383a1e633390a2e",
    "0x101816545F6bd2b1076434B54383a1E633390A2E",
    "0xdf0770dF86a8034b3EFEf0A1Bb3c889B8332FF56",
    "0x38ea452219524bb87e18de1c24d3bb59510bd783",
    "0x692953e758c3669290cb1677180c64183cEe374e",
    "0x0Faf1d2d3CED330824de3B8200fc8dc6E397850d",
    "0xfA0F307783AC21C39E939ACFF795e27b650F6e68",
    "0x590d4f8A68583639f215f675F3a259Ed84790580",
    "0xE8F55368C82D38bbbbDb5533e7F56AfC2E978CC2",
    "0x9cef9a0b1be0d289ac9f4a98ff317c33eaa84eb8",
    "0xd8772edBF88bBa2667ed011542343b0eDDaCDa47",
    "0x430Ebff5E3E80A6C58E7e6ADA1d90F5c28AA116d",
    "0xa572d137666dcbadfa47c3fc41f15e90134c618c",
  ],
  [CHAIN.ARBITRUM]: [
    "0x915A55e36A01285A14f05dE6e81ED9cE89772f8e",
    "0x892785f33CdeE22A30AEF750F285E18c18040c3e",
    "0xB6CfcF89a7B22988bfC96632aC2A9D6daB60d641",
    "0xaa4BF442F024820B2C28Cd0FD72b82c63e66F56C",
    "0xF39B7Be294cB36dE8c510e267B82bb588705d977",
    "0x600E576F9d853c95d58029093A16EE49646F3ca5",
  ],
  [CHAIN.AVAX]: [
    "0x1205f31718499dBf1fCa446663B532Ef87481fe1",
    "0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c",
    "0x1c272232Df0bb6225dA87f4dEcD9d37c32f63Eea",
    "0x8736f92646B2542B3e5F3c63590cA7Fe313e283B",
    "0xEAe5c2F6B25933deB62f754f239111413A0A25ef",
  ],
  [CHAIN.BSC]: [
    "0x9aA83081AA06AF7208Dcc7A4cB72C94d057D2cda",
    "0x98a5737749490856b401DB5Dc27F522fC314A4e1",
    "0x4e145a589e4c03cBe3d28520e4BF3089834289Df",
    "0x7BfD7f2498C4796f10b6C611D9db393D3052510C",
    "0x68C6c27fB0e02285829e69240BE16f32C5f8bEFe",
  ],
  [CHAIN.FANTOM]: ["0x12edeA9cd262006cC3C4E77c90d2CD2DD4b1eb97"],
  [CHAIN.OPTIMISM]: [
    "0xd22363e3762cA7339569F3d33EADe20127D5F98C",
    "0x165137624F1f692e69659f944BF69DE02874ee27",
    "0x368605D9C6243A80903b9e326f1Cddde088B8924",
    "0x2F8bC9081c7FCFeC25b9f41a50d97EaA592058ae",
    "0x3533F5e279bDBf550272a199a223dA798D9eff78",
    "0x5421FA1A48f9FF81e4580557E86C7C0D24C18036",
  ],
  [CHAIN.POLYGON]: [
    "0x1205f31718499dBf1fCa446663B532Ef87481fe1",
    "0x29e38769f23701A2e4A8Ef0492e19dA4604Be62c",
    "0x1c272232Df0bb6225dA87f4dEcD9d37c32f63Eea",
    "0x8736f92646B2542B3e5F3c63590cA7Fe313e283B",
  ],
  [CHAIN.METIS]: [
    "0xAad094F6A75A14417d39f04E690fC216f080A41a",
    "0x2b60473a7C41Deb80EDdaafD5560e963440eb632",
  ],
  [CHAIN.BASE]: [
    "0x28fc411f9e1c480AD312b3d9C60c22b965015c6B",
    "0x4c80e24119cfb836cdf0a6b53dc23f04f7e652ca",
  ],
  [CHAIN.LINEA]: ["0xAad094F6A75A14417d39f04E690fC216f080A41a"],
  [CHAIN.KAVA]: ["0xAad094F6A75A14417d39f04E690fC216f080A41a"],
  [CHAIN.MANTLE]: [
    "0xAad094F6A75A14417d39f04E690fC216f080A41a",
    "0x2b60473a7C41Deb80EDdaafD5560e963440eb632",
    "0xf52b354FFDB323E0667E87a0136040e3e4D9dF33",
  ],
};

type IMap = {
  [s: string]: string;
};

const mapTokenPrice: IMap = {
  ["0x101816545f6bd2b1076434b54383a1e633390a2e".toLowerCase()]: ADDRESSES.null,
  ["0xa572d137666dcbadfa47c3fc41f15e90134c618c".toLowerCase()]: ADDRESSES.null,
  ["0x915a55e36a01285a14f05de6e81ed9ce89772f8e".toLowerCase()]: ADDRESSES.null,
  ["0xd22363e3762ca7339569f3d33eade20127d5f98c".toLowerCase()]: ADDRESSES.null,
  ["0x28fc411f9e1c480AD312b3d9C60c22b965015c6B".toLowerCase()]: ADDRESSES.null,
  ["0xAad094F6A75A14417d39f04E690fC216f080A41a".toLowerCase()]: ADDRESSES.null,
  ["0xf52b354FFDB323E0667E87a0136040e3e4D9dF33".toLowerCase()]: ADDRESSES.null,
};

const fetch = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, getLogs }: FetchOptions
  ): Promise<FetchResultFees> => {
    const dailyFees = createBalances();
    const transform = (a: string) => mapTokenPrice[a.toLowerCase()] ?? a;
    const logs = await getLogs({
      targets: contract_address[chain],
      eventAbi: event0_swap,
      flatten: false,
    });
    const logs_swap_remote = await getLogs({
      targets: contract_address[chain],
      eventAbi: event0_swap_remote,
      flatten: false,
    });
    logs.forEach((_: any, index: number) =>
      _.forEach((log: any) =>
        dailyFees.add(
          transform(contract_address[chain][index]),
          log.protocolFee
        )
      )
    );
    logs_swap_remote.forEach((_: any, index: number) =>
      _.forEach((log: any) =>
        dailyFees.add(
          transform(contract_address[chain][index]),
          log.protocolFee
        )
      )
    );
    return { dailyFees, dailyRevenue: dailyFees, timestamp };
  };
};

const info = {
  methodology: {
    Fees: 'Total bridge fees paid by users',
    Revenue: 'Total bridge fees paid by users',
  }
}

const adapter: Adapter = {
  methodology: info.methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(CHAIN.ETHEREUM),
      start: '2022-09-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2022-09-01',
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: '2022-09-01',
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: '2022-09-01',
    },
    // [CHAIN.FANTOM]: {
    //   fetch: fetch(CHAIN.FANTOM),
    //   start: '2022-09-01',
    // },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2022-09-01',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: '2022-09-01',
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: '2022-09-01',
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2022-09-01',
    },
    [CHAIN.LINEA]: {
      fetch: fetch(CHAIN.LINEA),
      start: '2022-09-01',
    },
    [CHAIN.MANTLE]: {
      fetch: fetch(CHAIN.MANTLE),
      start: '2022-09-01',
    },
    [CHAIN.KAVA]: {
      fetch: fetch(CHAIN.KAVA),
      start: '2022-09-01',
    },
  },
};

export default adapter;
