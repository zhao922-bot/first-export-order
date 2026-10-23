export function stageRoute(stage?: number): string {
  return stage === 7
    ? '/documents'
    : stage === 6
      ? '/logistics'
      : stage === 5
        ? '/contract'
        : stage === 4
          ? '/chat'
          : stage === 2
            ? '/mail'
            : stage === 3
              ? '/quote'
              : '/supplier';
}
