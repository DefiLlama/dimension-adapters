import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchAjna } from "../ajna-v1";
import { METRIC } from "../../helpers/metrics";

const RESERVE_INFO_ABI = "function reservesInfo() view returns (uint256, uint256, uint256, uint256, uint256)"

const chainConfig: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    factory: '0x6146DD43C5622bB6D12A5240ab9CF4de14eDC625',
    poolUtils: '0x30c5eF2997d6a882DE52c4ec01B6D0a5e5B4fAAE',
    start: '2024-01-04'
  },
  [CHAIN.ARBITRUM]: {
    factory: '0xA3A1e968Bd6C578205E11256c8e6929f21742aAF',
    poolUtils: '0x8a7F5aFb7E3c3fD1f3Cc9D874b454b6De11EBbC9',
    start: '2024-01-17'
  },
  [CHAIN.AVAX]: {
    factory: '0x2aA2A6e6B4b20f496A4Ed65566a6FD13b1b8A17A',
    poolUtils: '0x9e407019C07b50e8D7C2d0E2F796C4eCb0F485b3',
    start: '2024-12-18'
  },
  [CHAIN.BASE]: {
    factory: '0x214f62B5836D83f3D6c4f71F174209097B1A779C',
    poolUtils: '0x97fa9b0909C238D170C1ab3B5c728A3a45BBEcBa',
    start: '2024-01-17'
  },
  [CHAIN.BLAST]: {
    factory: '0xcfCB7fb8c13c7bEffC619c3413Ad349Cbc6D5c91',
    poolUtils: '0x6aF0363e5d2ddab4471f31Fe2834145Aea1E55Ee',
    start: '2024-03-05'
  },
  [CHAIN.BSC]: {
    factory: '0x86eE95085F204B525b590f21dec55e2373F6da69',
    poolUtils: '0x81557781862D3e0FF7559080C2A9AE1F08Ee8421',
    start: '2024-11-05'
  },
  [CHAIN.FILECOIN]: {
    factory: '0x0E4a2276Ac259CF226eEC6536f2b447Fc26F2D8a',
    poolUtils: '0xCF7e3DABBaD8F0F3fdf1AE8a13C4be3872d06d56',
    start: '2024-03-19'
  },
  [CHAIN.XDAI]: {
    factory: '0x87578E357358163FCAb1711c62AcDB5BBFa1C9ef',
    poolUtils: '0x2baB4c287cF33a6eC373CFE152FdbA299B653F7D',
    start: '2024-01-23'
  },
  [CHAIN.HEMI]: {
    factory: '0xE47b3D287Fc485A75146A59d459EC8CD0F8E5021',
    poolUtils: '0xab57F608c37879360D622C32C6eF3BBa79AA667D',
    start: '2025-01-10'
  },
  [CHAIN.LINEA]: {
    factory: '0xd72A448C3BC8f47EAfFc2C88Cf9aC9423Bfb5067',
    poolUtils: '0x3AFcEcB6A943746eccd72eb6801E534f8887eEA1',
    start: '2024-06-20'
  },
  [CHAIN.MODE]: {
    factory: '0x62Cf5d9075D1d6540A6c7Fa836162F01a264115A',
    poolUtils: '0x6EF483c3653907c19bDD4300087e481551880c60',
    start: '2024-04-30'
  },
  [CHAIN.OPTIMISM]: {
    factory: '0x609C4e8804fafC07c96bE81A8a98d0AdCf2b7Dfa',
    poolUtils: '0xdE6C8171b5b971F71C405631f4e0568ed8491aaC',
    start: '2024-01-17'
  },
  [CHAIN.POLYGON]: {
    factory: '0x1f172F881eBa06Aa7a991651780527C173783Cf6',
    poolUtils: '0x519021054846cd3D9883359B593B5ED3058Fbe9f',
    start: '2024-01-17'
  },
  [CHAIN.RARI]: {
    factory: '0x10cE36851B0aAf4b5FCAdc93f176aC441D4819c9',
    poolUtils: '0xe85958CD5d59755470F6217aE9ee2Aa88eD02eE5',
    start: '2024-07-23'
  },
}

const fetch = async (options: FetchOptions) => {
  return fetchAjna(options, chainConfig[options.chain].factory, chainConfig[options.chain].poolUtils, 4, RESERVE_INFO_ABI)
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers for loans, with approximately 85-90% distributed to lenders",
    "Reserve accumulation": "Portion of borrow interest accumulated in pool reserves, approximately 10-15% of total interest, held for future token burns",
    [METRIC.TOKEN_BUY_BACK]: "AJNA token burns executed through reserve auctions, reducing circulating supply"
  },
  Revenue: {
    [METRIC.TOKEN_BUY_BACK]: "AJNA token burns funded by accumulated reserves through periodic auctions"
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest distributed to lenders who supply liquidity to lending pools"
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "AJNA token burns that reduce circulating supply, benefiting all token holders"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: "Fees collected from borrowers, lenders, and penalties",
    Revenue: "~10-15% net interest margin + origination fees and penalties are used to burn AJNA token",
    ProtocolRevenue: "Protocol takes no direct fees",
    HoldersRevenue: "Accumulated fees in reserves are used for token burns by utilizing auctions",
    dailySupplySideRevenue: "~85-90% interest rate goes to lenders from borrowers"
  },
  breakdownMethodology,
};

export default adapter;
