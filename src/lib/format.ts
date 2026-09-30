export const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function pctBelow(current: number, average: number) {
  return ((average - current) / average) * 100
}

export function scoreLabel(score: number) {
  if (score >= 90) return 'Oferta excepcional'
  if (score >= 75) return 'Oferta quente'
  if (score >= 60) return 'Oferta'
  if (score >= 40) return 'Acompanhar'
  return 'Ignorar'
}
