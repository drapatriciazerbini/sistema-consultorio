/**
 * Quem atende, nas frases fixas do robo.
 *
 * Veio do sistema de origem em 30/09/2026. La, o mapa separa a clinica real da
 * clinica de teste. Aqui ha uma clinica so, a da Dra. Patricia: toda frase
 * fixa do robo fala dela. Se um dia entrar outra clinica neste banco, este
 * mapa vira coluna no banco.
 */
export type QuemAtende = {
  /** No meio da frase: "quem responde e {o}", "Vou passar para {o}". */
  o: string
  /** No comeco da frase: "{O} vai revisar". */
  O: string
  /** Saudacao usada so quando a clinica nao cadastrou a dela. */
  saudacaoPadrao: string
}

const DRA_PATRICIA: QuemAtende = {
  o: 'a Dra. Patrícia',
  O: 'A Dra. Patrícia',
  saudacaoPadrao: 'Olá! 👋 Aqui é o consultório da Dra. Patrícia Zerbini.',
}

export function quemAtende(clinicId?: string | null): QuemAtende {
  void clinicId
  return DRA_PATRICIA
}
