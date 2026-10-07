import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, Clock3, Pencil, Play, Plus, RefreshCw, Search, Send, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { money, latestScore } from '@/components/jhow/data'
import { useAdmin } from '@/components/jhow/useAdmin'
import {
  getTelegramBotStatus,
  processTelegramQueue,
  sendTelegramPost,
  sendTelegramTest,
} from '@/components/jhow/telegram.functions'
import type { Database } from '@/integrations/supabase/types'

type Channel = Database['public']['Tables']['telegram_channels']['Row']
type Post = Database['public']['Tables']['telegram_posts']['Row']

type ChannelForm = {
  name: string
  chat_id: string
  min_score: string
  repost_cooldown_minutes: string
  repost_min_drop_percent: string
  allowed_categories: string
  message_template: string
  require_affiliate: boolean
  active: boolean
}

const blank: ChannelForm = {
  name: '',
  chat_id: '',
  min_score: '75',
  repost_cooldown_minutes: '360',
  repost_min_drop_percent: '5',
  allowed_categories: '',
  message_template: '',
  require_affiliate: true,
  active: true,
}

export const Route = createFileRoute('/_authenticated/telegram')({
  head: () => ({
    meta: [
      { title: 'Telegram — Jhow Ofertas' },
      { name: 'description', content: 'Canais, fila e automação do Telegram.' },
    ],
  }),
  component: TelegramPage,
})

async function loadTelegram() {
  const [channels, posts] = await Promise.all([
    supabase.from('telegram_channels').select('*').order('name'),
    supabase.from('telegram_posts').select('*').order('created_at', { ascending: false }).limit(300),
  ])
  if (channels.error) throw channels.error
  if (posts.error) throw posts.error
  return { channels: channels.data ?? [], posts: posts.data ?? [] }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function statusBadge(status: string) {
  const cls =
    status === 'sent'
      ? 'border-success/30 bg-success/10 text-success'
      : status === 'failed'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : status === 'sending'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-600'
  const labels: Record<string, string> = {
    pending: 'Pendente',
    sending: 'Enviando',
    sent: 'Enviado',
    failed: 'Falhou',
  }
  return <span className={`inline-flex border px-2 py-1 text-xs font-medium ${cls}`}>{labels[status] ?? status}</span>
}

function payloadRecord(post: Post) {
  return post.payload && typeof post.payload === 'object' && !Array.isArray(post.payload)
    ? post.payload as Record<string, unknown>
    : {}
}

function TelegramPage() {
  const { data: admin, isPending: adminPending, error: adminError } = useAdmin()
  const queryClient = useQueryClient()
  const telegram = useQuery({ queryKey: ['telegram-data'], queryFn: loadTelegram, refetchInterval: 30_000 })
  const botStatus = useQuery({ queryKey: ['telegram-bot-status'], queryFn: () => getTelegramBotStatus(), retry: false })

  const [editing, setEditing] = useState<Channel | null | undefined>(undefined)
  const [form, setForm] = useState<ChannelForm>(blank)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [offerId, setOfferId] = useState('')
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [sendingPost, setSendingPost] = useState<number | null>(null)

  if (adminPending || telegram.isPending) return <p className="text-muted-foreground">Carregando Telegram...</p>
  if (adminError || !admin) return <p role="alert" className="text-destructive">Não foi possível carregar produtos/ofertas: {adminError?.message}</p>
  if (telegram.error || !telegram.data) return <p role="alert" className="text-destructive">Não foi possível carregar o Telegram: {telegram.error?.message}</p>

  const { channels, posts } = telegram.data
  const productName = (id: string | null) => {
    const offer = id ? admin.offers.find((item) => item.id === id) : undefined
    return offer ? admin.products.find((item) => item.id === offer.product_id)?.name ?? 'Produto removido' : '—'
  }
  const channelName = (id: string | null) => id ? channels.find((channel) => channel.id === id)?.name ?? 'Canal removido' : '—'

  const postRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return posts.filter((post) => {
      const payload = payloadRecord(post)
      const text = [
        productName(post.product_offer_id),
        channelName(post.channel_id),
        payload['store_name'],
        payload['coupon_code'],
        post.error,
      ].filter(Boolean).join(' ').toLowerCase()
      return (statusFilter === 'all' || post.status === statusFilter) && (!term || text.includes(term))
    })
  }, [posts, channels, admin, search, statusFilter])

  const pending = posts.filter((post) => post.status === 'pending').length
  const sent = posts.filter((post) => post.status === 'sent').length
  const failed = posts.filter((post) => post.status === 'failed').length
  const activeChannels = channels.filter((channel) => channel.active).length

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['telegram-data'] }),
      queryClient.invalidateQueries({ queryKey: ['telegram-bot-status'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-data'] }),
    ])
  }

  function open(channel?: Channel) {
    setEditing(channel ?? null)
    setMessage('')
    setForm(channel ? {
      name: channel.name,
      chat_id: channel.chat_id,
      min_score: String(channel.min_score),
      repost_cooldown_minutes: String(channel.repost_cooldown_minutes),
      repost_min_drop_percent: String(channel.repost_min_drop_percent),
      allowed_categories: channel.allowed_categories.join(', '),
      message_template: channel.message_template ?? '',
      require_affiliate: channel.require_affiliate,
      active: channel.active,
    } : { ...blank })
  }

  async function saveChannel(event: FormEvent) {
    event.preventDefault()
    const minScore = Number(form.min_score)
    const cooldown = Number(form.repost_cooldown_minutes)
    const minDrop = Number(form.repost_min_drop_percent)

    if (!form.name.trim() || !form.chat_id.trim()) {
      setMessage('Informe nome e Chat ID/@username do canal.')
      return
    }
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) {
      setMessage('Score mínimo precisa ficar entre 0 e 100.')
      return
    }
    if (!Number.isFinite(cooldown) || cooldown < 1) {
      setMessage('Cooldown precisa ser maior que zero.')
      return
    }
    if (!Number.isFinite(minDrop) || minDrop < 0 || minDrop > 100) {
      setMessage('Queda mínima de repost precisa ficar entre 0 e 100%.')
      return
    }

    const payload = {
      name: form.name.trim(),
      chat_id: form.chat_id.trim(),
      min_score: minScore,
      repost_cooldown_minutes: cooldown,
      repost_min_drop_percent: minDrop,
      allowed_categories: form.allowed_categories
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      message_template: form.message_template.trim() || null,
      require_affiliate: form.require_affiliate,
      active: form.active,
    }

    setSaving(true)
    const result = editing
      ? await supabase.from('telegram_channels').update(payload).eq('id', editing.id)
      : await supabase.from('telegram_channels').insert(payload)
    setSaving(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setEditing(undefined)
    setMessage('Canal salvo.')
    await refresh()
  }

  async function removeChannel(channel: Channel) {
    if (!window.confirm(`Excluir o canal ${channel.name}? O histórico de posts continuará preservado sem vínculo com o canal.`)) return
    const result = await supabase.from('telegram_channels').delete().eq('id', channel.id)
    if (result.error) setMessage(result.error.message)
    else await refresh()
  }

  async function testChannel(channel: Channel) {
    setTestingId(channel.id)
    setMessage('')
    try {
      const result = await sendTelegramTest({ data: { chatId: channel.chat_id } })
      setMessage(`Teste enviado para ${channel.name}. Mensagem #${result.messageId}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha no teste do Telegram.')
    } finally {
      setTestingId(null)
      await queryClient.invalidateQueries({ queryKey: ['telegram-bot-status'] })
    }
  }

  async function queueOffer() {
    if (!offerId) {
      setMessage('Escolha uma oferta para enfileirar.')
      return
    }
    const result = await supabase.rpc('queue_telegram_offer_admin', { p_offer_id: offerId })
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setMessage(result.data
      ? `${result.data} publicação(ões) adicionada(s) à fila.`
      : 'A oferta não entrou na fila. Verifique score mínimo, categoria, estoque e anti-spam.')
    await refresh()
  }

  async function processQueue() {
    setProcessing(true)
    setMessage('')
    try {
      const result = await processTelegramQueue({ data: { limit: 10 } })
      setMessage(`Fila processada: ${result.processed} item(ns), ${result.sent} enviado(s), ${result.errors.length} erro(s).`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível processar a fila.')
    } finally {
      setProcessing(false)
      await refresh()
    }
  }

  async function sendPost(post: Post) {
    setSendingPost(post.id)
    setMessage('')
    try {
      await sendTelegramPost({ data: { postId: post.id } })
      setMessage(`Publicação #${post.id} enviada.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar publicação.')
    } finally {
      setSendingPost(null)
      await refresh()
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Telegram</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Canais, regras de publicação, anti-spam e fila de ofertas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => open()}><Plus size={16} /> Adicionar canal</Button>
          <Button variant="outline" onClick={refresh}><RefreshCw size={16} /> Atualizar</Button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Bot <Bot size={18} /></div>
          <p className="mt-4 text-lg font-semibold">
            {botStatus.isPending ? 'Verificando...' : botStatus.data?.connected ? 'Conectado' : botStatus.data?.configured ? 'Com erro' : 'Sem token'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {botStatus.data?.username ? `@${botStatus.data.username}` : botStatus.data?.error ?? 'TELEGRAM_BOT_TOKEN'}
          </p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Canais ativos <Send size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{activeChannels}</p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Pendentes <Clock3 size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{pending}</p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Enviados <CheckCircle2 size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{sent}</p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Falhas <XCircle size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{failed}</p>
        </div>
      </section>

      {message && <div className="border border-border bg-card p-3 text-sm text-muted-foreground">{message}</div>}

      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
          <div>
            <h2 className="font-semibold">Canais</h2>
            <p className="mt-1 text-xs text-muted-foreground">Use @username para canal público ou o chat_id numérico.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>{['Canal', 'Destino', 'Score mínimo', 'Categorias', 'Afiliado', 'Anti-spam', 'Status', 'Ações'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id} className="border-t border-border/70">
                  <td className="px-4 py-3 font-medium">{channel.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{channel.chat_id}</td>
                  <td className="px-4 py-3">{channel.min_score}/100</td>
                  <td className="max-w-[260px] px-4 py-3 text-xs text-muted-foreground">
                    {channel.allowed_categories.length ? channel.allowed_categories.join(', ') : 'Todas'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={channel.require_affiliate ? 'font-medium text-success' : 'text-muted-foreground'}>{channel.require_affiliate ? 'Obrigatório' : 'Opcional'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p>{channel.repost_cooldown_minutes} min</p>
                    <p className="text-muted-foreground">ou queda ≥ {Number(channel.repost_min_drop_percent).toLocaleString('pt-BR')}%</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={channel.active ? 'text-success' : 'text-muted-foreground'}>{channel.active ? 'Ativo' : 'Inativo'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => testChannel(channel)} disabled={testingId === channel.id}>
                        <Play size={15} /> {testingId === channel.id ? 'Testando...' : 'Testar'}
                      </Button>
                      <Button size="icon" variant="ghost" title="Editar canal" onClick={() => open(channel)}><Pencil size={16} /></Button>
                      <Button size="icon" variant="ghost" title="Excluir canal" onClick={() => removeChannel(channel)}><Trash2 size={16} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!channels.length && <p className="px-4 py-10 text-center text-muted-foreground">Nenhum canal cadastrado.</p>}
        </div>
      </section>

      <section className="border border-border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[280px] flex-1 text-sm font-medium">
            Enfileirar oferta manualmente
            <select
              value={offerId}
              onChange={(event) => setOfferId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Escolha uma oferta...</option>
              {admin.offers.filter((offer) => offer.active).map((offer) => {
                const product = admin.products.find((item) => item.id === offer.product_id)
                const store = admin.stores.find((item) => item.id === offer.store_id)
                const score = latestScore(admin, offer.id)
                return <option key={offer.id} value={offer.id}>{product?.name ?? 'Produto'} — {store?.name ?? 'Loja'} — score {score?.score ?? '—'}</option>
              })}
            </select>
          </label>
          <Button variant="outline" onClick={queueOffer}><Plus size={16} /> Enfileirar se elegível</Button>
          <Button onClick={processQueue} disabled={processing || pending === 0}><Send size={16} /> {processing ? 'Processando...' : 'Enviar fila (até 10)'}</Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-[280px] max-w-lg flex-1 items-center gap-2 border border-border bg-card px-3 py-2 text-muted-foreground">
            <Search size={17} />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, canal, loja ou cupom..." className="h-7 border-0 bg-transparent shadow-none" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="sending">Enviando</option>
            <option value="sent">Enviados</option>
            <option value="failed">Falhas</option>
          </select>
        </div>

        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>{['Quando', 'Produto', 'Canal', 'Preço', 'Link usado', 'Score', 'Status', 'Tentativas', 'Erro', 'Ações'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {postRows.map((post) => {
                const payload = payloadRecord(post)
                return (
                  <tr key={post.id} className="border-b border-border/70 last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(post.sent_at ?? post.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{productName(post.product_offer_id)}</p>
                      <p className="text-xs text-muted-foreground">{String(payload['store_name'] ?? '')}</p>
                    </td>
                    <td className="px-4 py-3">{channelName(post.channel_id)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{money(post.effective_price ?? post.price)}</p>
                      {payload['coupon_code'] ? <p className="text-xs text-success">cupom {String(payload['coupon_code'])}</p> : null}
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <p className={post.used_affiliate ? 'font-medium text-success' : 'text-muted-foreground'}>{post.used_affiliate ? 'Afiliado' : 'URL normal'}</p>
                      {post.published_url && <a href={post.published_url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-primary" title={post.published_url}>{post.published_url}</a>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">{post.score ?? '—'}</td>
                    <td className="px-4 py-3">{statusBadge(post.status)}</td>
                    <td className="px-4 py-3">{post.attempts}</td>
                    <td className="max-w-[280px] px-4 py-3 text-xs text-destructive">{post.error ?? '—'}</td>
                    <td className="px-4 py-3">
                      {post.status !== 'sent' && (
                        <Button size="sm" variant="ghost" disabled={sendingPost === post.id} onClick={() => sendPost(post)}>
                          <Send size={15} /> {sendingPost === post.id ? 'Enviando...' : 'Enviar agora'}
                        </Button>
                      )}
                      {post.status === 'sent' && <span className="text-xs text-muted-foreground">msg #{post.telegram_message_id ?? '—'}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!postRows.length && <p className="px-4 py-10 text-center text-muted-foreground">Nenhuma publicação encontrada.</p>}
        </div>
      </section>

      <Dialog open={editing !== undefined} onOpenChange={(openDialog) => { if (!openDialog) setEditing(undefined) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Editar canal' : 'Adicionar canal'}</DialogTitle></DialogHeader>
          <form onSubmit={saveChannel} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Nome
                <Input className="mt-1.5" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jhow Ofertas - Informática" required />
              </label>
              <label className="block text-sm font-medium">
                Chat ID ou @username
                <Input className="mt-1.5 font-mono" value={form.chat_id} onChange={(event) => setForm({ ...form, chat_id: event.target.value })} placeholder="@jhowofertas" required />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Score mínimo
                <Input className="mt-1.5" type="number" min="0" max="100" value={form.min_score} onChange={(event) => setForm({ ...form, min_score: event.target.value })} />
              </label>
              <label className="block text-sm font-medium">
                Cooldown de repost
                <Input className="mt-1.5" type="number" min="1" value={form.repost_cooldown_minutes} onChange={(event) => setForm({ ...form, repost_cooldown_minutes: event.target.value })} />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">minutos</span>
              </label>
              <label className="block text-sm font-medium">
                Queda mínima para repost
                <Input className="mt-1.5" type="number" min="0" max="100" step="0.1" value={form.repost_min_drop_percent} onChange={(event) => setForm({ ...form, repost_min_drop_percent: event.target.value })} />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">%</span>
              </label>
            </div>
            <label className="block text-sm font-medium">
              Categorias permitidas
              <Input className="mt-1.5" value={form.allowed_categories} onChange={(event) => setForm({ ...form, allowed_categories: event.target.value })} placeholder="Informática, Hardware, Periféricos" />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">Separe por vírgula. Vazio = todas as categorias.</span>
            </label>
            <label className="block text-sm font-medium">
              Template personalizado
              <Textarea className="mt-1.5 min-h-40 font-mono text-xs" value={form.message_template} onChange={(event) => setForm({ ...form, message_template: event.target.value })} placeholder="Vazio usa o template padrão do Jhow Ofertas." />
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                Tokens: {'{{produto}}'}, {'{{loja}}'}, {'{{preco}}'}, {'{{preco_final}}'}, {'{{cupom}}'}, {'{{frete}}'}, {'{{score}}'}, {'{{abaixo_media}}'}, {'{{classificacao}}'}.
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between border border-border bg-background p-4">
                <div>
                  <p className="text-sm font-medium">Exigir afiliado</p>
                  <p className="text-xs text-muted-foreground">O canal não recebe ofertas sem link afiliado elegível.</p>
                </div>
                <Switch checked={form.require_affiliate} onCheckedChange={(value) => setForm({ ...form, require_affiliate: value })} />
              </div>
              <div className="flex items-center justify-between border border-border bg-background p-4">
                <div>
                  <p className="text-sm font-medium">Canal ativo</p>
                  <p className="text-xs text-muted-foreground">Somente canais ativos recebem novas ofertas.</p>
                </div>
                <Switch checked={form.active} onCheckedChange={(value) => setForm({ ...form, active: value })} />
              </div>
            </div>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar canal'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
