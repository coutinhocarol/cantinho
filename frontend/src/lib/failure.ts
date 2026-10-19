/**
 * Traduz falhas do servidor em mensagens claras. O site roda no plano gratuito da Cloudflare
 * (Workers) e do Supabase, então "acabou a cota" e "banco pausado" são situações reais.
 */
type FailureKind = 'limit' | 'db' | 'server' | 'network' | 'users_limit'

export const MESSAGES: Record<FailureKind, string> = {
  limit:
    'O servidor atingiu o limite de uso do plano gratuito da Cloudflare. O limite diário reinicia por volta das 21h (horário de Brasília). Tente de novo mais tarde.',
  db: 'O banco de dados está indisponível no momento. No plano gratuito do Supabase ele pode estar pausado por inatividade. Tente de novo em instantes.',
  server: 'O servidor teve um problema. Tente de novo em instantes.',
  network: 'Sem conexão com o servidor. Confira a sua internet e tente de novo.',
  users_limit: 'O limite de contas deste site foi atingido. Tente novamente mais tarde.',
}

export class ServiceError extends Error {
  kind: FailureKind
  status: number
  constructor(kind: FailureKind, status = 0) {
    super(MESSAGES[kind])
    this.kind = kind
    this.status = status
  }
}

/** Resposta de erro (5xx/429) → mensagem. Páginas HTML de erro vêm da própria Cloudflare. */
export async function failureFromResponse(res: Response): Promise<ServiceError | null> {
  const isHtml = (res.headers.get('content-type') ?? '').includes('text/html')
  let code = ''
  if (!isHtml) {
    try {
      code = (await res.clone().json())?.code ?? ''
    } catch {
      /* sem corpo JSON */
    }
  }
  if (code === 'users_limit') return new ServiceError('users_limit', res.status)
  if (code === 'db_unavailable') return new ServiceError('db', res.status)
  if (res.status === 429) return new ServiceError('limit', res.status)
  // erro 1102/1027 da Cloudflare (CPU ou requisições do plano gratuito) chega como página HTML
  if (res.status >= 500 && isHtml) return new ServiceError('limit', res.status)
  if (res.status >= 500) return new ServiceError('server', res.status)
  return null
}

export const networkFailure = () => new ServiceError('network')
