import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const fetch = async ({ api, getLogs, createBalances }: FetchOptions) => {
    const dailyVolume = createBalances();
    const pools = [
        '0x13329c7905f1ee55c3c7d7bfc26c1197c512c207',
        '0x1f182e3d225603f9888b51f2cbca687e044524f8',
        '0x233ba46b01d2fbf1a31bdbc500702e286d6de218',
        '0x2779ebcdb6c70d10174138f43892400e132f6deb',
        '0x27912ae6ba9a54219d8287c3540a8969ff35500b',
        '0x2c00cb6ee27ad73e95d54ab5c49cb65c2f69bec4',
        '0x30c30d826be87cd0a4b90855c2f38f7fcfe4eaa7',
        '0x39de4e02f76dbd4352ec2c926d8d64db8abdf5b2',
        '0x4658ea7e9960d6158a261104aaa160cc953bb6ba',
        '0x5a2f12794ebfb537b85b2630a39ee02c140c356e',
        '0x5d473d944858f0d54a8539999d8fccb7da2d2ce9',
        '0x5ee9008e49b922cafef9dde21446934547e42ad6',
        '0x66357dcace80431aee0a7507e2e361b7e2402370',
        '0x81e63d0eeba2d85609a6b206737e98e39b888f4c',
        '0x860f7ab2375087d5e16af6843f85263a1b72888f',
        '0x89e9efd9614621309ada948a761d364f0236edea',
        '0x8b4a45da5b0705ae4f47ebefc180c099345cf57e',
        '0x91bb10d68c72d64a7ce10482b453153eea03322c',
        '0xb3393f4e609c504da770ebc968540784cc4e016c',
        '0xb8e567fc23c39c94a1f6359509d7b43d1fbed824',
        '0xbbcabd0ab2d4d2788357a9b2f5c695acea3e2e40',
        '0xbe52548488992cc76ffa1b42f3a58f646864df45',
        '0xc828d995c686aaba78a4ac89dfc8ec0ff4c5be83',
        '0xca0517f38a66dd04c07c359e573f2ed737c8a592',
        '0xcee2163c8d3c0d226659aa7d87a438c8d791684e',
        '0xded29df6b2193b885f45b5f5027ed405291a96c1',
        '0xe0d166de15665bc4b7185b2e35e847e51316e126',
        '0xf823a18070dfc733520d84bb57d4f7d3350854ab'
    ]
    const eventAbi = 'event Swap (address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address indexed to)'
    const logs = await getLogs({ targets: pools, eventAbi })
    logs.forEach(log => {
        addOneToken({ chain: api.chain, balances: dailyVolume, token0: log.fromToken, token1: log.toToken, amount0: log.fromAmount, amount1: log.toAmount })
    })
    return { dailyVolume };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.AVAX]: {
            fetch,
            start: '2021-10-26',
        },
    },
};

export default adapter;
