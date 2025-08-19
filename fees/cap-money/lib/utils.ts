export const arrayZip = <A, B>(a: A[], b: B[]) => {
	const maxLength = Math.max(a.length, b.length);
	return Array.from({ length: maxLength }, (_, i) => [a[i], b[i]]) as [A, B][];
};
