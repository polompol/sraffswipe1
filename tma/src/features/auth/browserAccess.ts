export function allowRoleChoice({
  insideTelegram,
  useBackend,
}: {
  insideTelegram: boolean;
  useBackend: boolean;
}): boolean {
  return insideTelegram || !useBackend;
}
