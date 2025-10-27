async function fetch() {
    const TWO_128 = 1n << 128n;
    const TWO_127 = 1n << 127n;
    let a =115792089237316156902109641343528675284641389308863514006600682331330127065037n>>128n
    if (a > TWO_127) a = a - TWO_128;
    console.log(Number(a)/1e18)
}

const adapter = {
    fetch,
    chains: ['ethereum']
}
export default adapter;