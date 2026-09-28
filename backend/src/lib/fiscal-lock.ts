export function rejectIfLocked(entityCreatedAt: string, fieldChanged?: string) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const entityDate = new Date(entityCreatedAt);

  if (entityDate < currentMonthStart) {
    // Entity existed in a previous month
    if (!fieldChanged || ['salary', 'price', 'amount'].includes(fieldChanged)) {
      throw new Error('Impossible de modifier les données financières d’un mois antérieur.');
    }
  }
}