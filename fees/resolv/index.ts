import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json';

const USR = '0x66a1e37c9b0eaddca17d3662d6c05f4decf3e110';
const ST_USR = '0x6c8984bc7DBBeDAf4F6b2FD766f16eBB7d10AAb4';
const WST_USR = '0x1202F5C7b4B9E47a1A484E8B270be34dbbC75055';
const RLP = '0x4956b52aE2fF65D74CA2d61207523288e4528f96';
const RLP_ORACLE = '0xaE2364579D6cB4Bbd6695846C1D595cA9AF3574d';
const FEE_COLLECTOR = '0x6E02e225329E32c854178d7c865cF70fE1617f02';

const WST_USR_ABI = 'function convertToAssets(uint256 _wstUSRAmount) external view returns (uint256 usrAmount)';

const fetch = async (options: FetchOptions) => {

    const totalSupply = await options.api.multiCall({
        abi: 'uint256:totalSupply',
        calls: [ST_USR, RLP],
        permitFailure: true
    });

    const [stUsrSupply, rlpSupply] = totalSupply.map(v => v / 1e18);
    const rlpPriceYesterday = await options.fromApi.call({
        abi: 'uint256:lastPrice',
        target: RLP_ORACLE,
    }) / 1e18;

    const rlpPriceToday = await options.toApi.call({
        abi: 'uint256:lastPrice',
        target: RLP_ORACLE,
    }) / 1e18;

    const wstPriceYesterday = await options.fromApi.call({
        abi: WST_USR_ABI,
        target: WST_USR,
        params: ['1000000000000000000']
    }) / 1e18;

    const wstPriceToday = await options.toApi.call({
        abi: WST_USR_ABI,
        target: WST_USR,
        params: ['1000000000000000000']
    }) / 1e18;


    const dailyYield = (((rlpPriceToday - rlpPriceYesterday) * rlpSupply) + ((wstPriceToday - wstPriceYesterday) * stUsrSupply));

    const dailyRevenue = await addTokensReceived({
        options,
        fromAdddesses: [ADDRESSES.null],
        token: USR,
        target: FEE_COLLECTOR
    });

    const dailyFees = options.createBalances();
    dailyFees.addUSDValue(dailyYield);
    dailyFees.add(dailyRevenue);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: 'Total yields from RLP and stUSR',
    Revenue: '10% of yields charged as protocol fee',
    ProtocolRevenue: 'All revenue goes to the protocol'
};

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2024-09-02'
};

export default adapter;