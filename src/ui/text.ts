/** "1 state", "3 states". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
