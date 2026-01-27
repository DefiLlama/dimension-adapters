import { compoundV2Export, } from "../helpers/compoundV2";

export default compoundV2Export({
    bsc: '0xfD36E2c2a6789Db23113685031d7F16329158384',
    ethereum: '0x687a01ecF6d3907658f7A7c714749fAC32336D1B',
    op_bnb: '0xd6e3e2a1d8d95cae355d15b3b9f8e5c2511874dd',
    arbitrum: '0x317c1A5739F39046E20b08ac9BeEa3f10fD43326',
    era: '0xddE4D098D9995B659724ae6d5E3FB9681Ac941B1',
    base: '0x0C7973F9598AA62f9e03B94E92C967fD5437426C',
    optimism: '0x5593FF68bE84C966821eEf5F0a988C285D5B7CeC',
    unichain: '0xe22af1e6b78318e1Fe1053Edbd7209b8Fc62c4Fe'
}, { protocolRevenueRatio: 0.6, holdersRevenueRatio: 0.4 });
// https://docs-v4.venus.io/governance/tokenomics#revenue-distribution-from-protocol-reserves
