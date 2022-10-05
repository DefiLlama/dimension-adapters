import { Adapter } from "../../../dexVolume.type";

export default async (folderName: string): Promise<Adapter> => (await import(`../../../fees/${folderName}`)).default