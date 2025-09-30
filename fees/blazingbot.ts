import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

// Contract addresses for each chain
const v2_contract_address = {
  [CHAIN.BSC]: '0xfdb7eF80BD6aB675CD52811BfB9329FbD9B92aBA',
  [CHAIN.BASE]: '0x6882912e2580471E5ac7a928a4f52F0bD2701810',
  [CHAIN.ETHEREUM]: '0xfdb7ef80bd6ab675cd52811bfb9329fbd9b92aba',
  [CHAIN.SONIC]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
  [CHAIN.BERACHAIN]: '0x6882912e2580471E5ac7a928a4f52F0bD2701810',
  [CHAIN.AVAX]: '0x6882912e2580471E5ac7a928a4f52F0bD2701810',
  [CHAIN.STORY]: '0x6882912e2580471E5ac7a928a4f52F0bD2701810',
};

const v3_contract_address = {
  [CHAIN.BSC]: '0xB23495f9a4807cD7672f382B9b0c2a3A0ec78649',
  [CHAIN.BASE]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
  [CHAIN.ETHEREUM]: '0x196f75367A9286E039C6CFEBa5B8686ed84cBa68',
  [CHAIN.SONIC]: '0xB23495f9a4807cD7672f382B9b0c2a3A0ec78649',
  [CHAIN.BERACHAIN]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
  [CHAIN.AVAX]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
  [CHAIN.STORY]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
};

const virtual_contract_address = { [CHAIN.BASE]: '0x803A70b24062e429Ce48801a0fAb6B13a994A454' };
const virtual_contract_aerodrome_v2 = { [CHAIN.BASE]: '0xEF11cB957088bd412c481Da54d5C7d325ff3A749' };
const virtual_contract_aerodrome_v3 = { [CHAIN.BASE]: '0x2b3C352E792ed34B7203022a68502FAd0db9C6E6' };
const blazing_contract_pharao_v2 = { [CHAIN.AVAX]: '0xe9e104d866680a3Fe06F66E1854f17bF6980716d' };
const blazing_contract_pharao_v3 = { [CHAIN.AVAX]: '0x803A70b24062e429Ce48801a0fAb6B13a994A454' };
const blazing_contract_panda = { [CHAIN.BERACHAIN]: '0xD790715Ae316629F4a0aDfC040e5d755190Fb05C' };
const blazing_contract_four_meme = { [CHAIN.BSC]: '0x022d4dAC69503ABfF5417b3D2F07BD03dEC37b05' };
const blazing_contract_memebox_v2 = { [CHAIN.SONIC]: '0x3Db46Ad3B2b6727c25A2947B0A93c3b0f4626B5B' };
const blazing_contract_equalizer_v2 = { [CHAIN.SONIC]: '0xDE15b04004331a24162f4503E4cd5cE926192c92' };
const blazing_contract_silverswap_v3 = { [CHAIN.SONIC]: '0x66684B8d430BD7f60bAa4190B450C8a2025CC57A' };
const blazing_contract_swapx_v2 = { [CHAIN.SONIC]: '0x022d4dAC69503ABfF5417b3D2F07BD03dEC37b05' };
const blazing_contract_swapx_v3 = { [CHAIN.SONIC]: '0x66684B8d430BD7f60bAa4190B450C8a2025CC57A' };
const blazing_contract_shadow_v2 = { [CHAIN.SONIC]: '0xB0B3e44e0a382E1915960ffD8fEBd813298fbC22' };
const blazing_contract_shadow_v3 = { [CHAIN.SONIC]: '0x1aAd8E39B446b6d82E9394067d8fD4C8ec91A176' };

const contractAddresses = {
  [CHAIN.BSC]: [
    v2_contract_address[CHAIN.BSC],
    v3_contract_address[CHAIN.BSC],
    blazing_contract_four_meme[CHAIN.BSC],
  ],
  [CHAIN.BASE]: [
    v2_contract_address[CHAIN.BASE],
    v3_contract_address[CHAIN.BASE],
    virtual_contract_address[CHAIN.BASE],
    virtual_contract_aerodrome_v2[CHAIN.BASE],
    virtual_contract_aerodrome_v3[CHAIN.BASE],
  ],
  [CHAIN.SONIC]: [
    v2_contract_address[CHAIN.SONIC],
    v3_contract_address[CHAIN.SONIC],
    blazing_contract_memebox_v2[CHAIN.SONIC],
    blazing_contract_equalizer_v2[CHAIN.SONIC],
    blazing_contract_silverswap_v3[CHAIN.SONIC],
    blazing_contract_swapx_v2[CHAIN.SONIC],
    blazing_contract_swapx_v3[CHAIN.SONIC],
    blazing_contract_shadow_v2[CHAIN.SONIC],
    blazing_contract_shadow_v3[CHAIN.SONIC],
  ],
  [CHAIN.AVAX]: [
    v2_contract_address[CHAIN.AVAX],
    v3_contract_address[CHAIN.AVAX],
    blazing_contract_pharao_v2[CHAIN.AVAX],
    blazing_contract_pharao_v3[CHAIN.AVAX],
  ],
  [CHAIN.BERACHAIN]: [
    v2_contract_address[CHAIN.BERACHAIN],
    v3_contract_address[CHAIN.BERACHAIN],
    blazing_contract_panda[CHAIN.BERACHAIN],
  ],
  [CHAIN.ETHEREUM]: [
    v2_contract_address[CHAIN.ETHEREUM],
    v3_contract_address[CHAIN.ETHEREUM],
  ],
  [CHAIN.STORY]: [
    v2_contract_address[CHAIN.STORY],
    v3_contract_address[CHAIN.STORY],
  ],
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const chain = options.chain;
  const addresses = contractAddresses[chain as keyof typeof contractAddresses] || [];

  if (addresses.length === 0) {
    return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  const logPromises = addresses.map((address) =>
    options.getLogs({
      topic: '0xac73d170101ac263d42f3626a4a5142cdae6d109e48d6310c276b1fd1f5f3854',
      target: address,
    })
  );

  const logs = await Promise.all(logPromises);
  logs.forEach((logSet) =>
    logSet.forEach((log: any) => {
      dailyFees.addGasToken(Number(log.data));
    })
  );

  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '4TTaKEKLjh1WJZttu1kvDtZt9N4G854C6ZKPAprZFRuy' });
  return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: 'All trading fees paid by users.',
  UserFees: 'All trading fees paid by users.',
  Revenue: 'All trading revenue goes to the protocol.',
  ProtocolRevenue: 'All trading revenue goes to the protocol.',
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-03-01', },
    [CHAIN.BSC]: { fetch, start: '2024-03-01', },
    [CHAIN.BASE]: { fetch, start: '2024-03-01', },
    [CHAIN.SONIC]: { fetch, start: '2024-12-15', },
    [CHAIN.AVAX]: { fetch, start: '2025-02-26', },
    [CHAIN.BERACHAIN]: { fetch, start: '2025-02-06', },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: '2024-11-23', },
    [CHAIN.STORY]: { fetch, start: '2025-08-12', },
  },
  methodology,
  isExpensiveAdapter: true,
};

export default adapter;