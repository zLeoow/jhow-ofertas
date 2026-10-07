import { useMemo, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CalendarClock, ExternalLink, Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { couponLabel } from '@/components/jhow/coupons'
import { money, type AdminData } from '@/components/jhow/data'
import { useAdmin } from '@/components/jhow/useAdmin'

type Coupon = AdminData['coupons'][number]

type CouponForm = {
  store_id: string
  code: string
  description: string
  discount_type: string
  discount_value: string
  minimum_purchase: string
  max_discount: string
  expires_at: string
  source_url: string
  notes: string
  verified: boolean
  active: boolean
}

const blank: CouponForm = {
  store_id: '',
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: '',
  minimum_purchase: '',
  max_discount: '',
  expires_at: '',
  source_url: '',
  notes: '',
  verified: false,
  active: true,
}

export const Route = createFileRoute('/_authenticated/cupons')({
  head: () => ({
    meta: [
      { title: 'Cupons — Jhow Ofertas' },
      { name: 'description', content: 'Cadastro, validação e aplicação de cupons.' },
    ],
  }),
  component: CouponsPage,
})

function toLocalInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function couponStatus(coupon: Coupon) {
  if (!coupon.active) return { label: 'Desativado', cls: 'border-border text-muted-foreground' }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) {
    return { label: 'Expirado', cls: 'border-destructive/30 bg-destructive/10 text-destructive' }
  }
  if (!coupon.verified) return { label: 'Não verificado', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600' }
  return { label: 'Verificado', cls: 'border-success/30 bg-success/10 text-success' }
}

function CouponsPage() {
  const { data, isPending, error } = useAdmin()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<Coupon | null | undefined>(undefined)
  const [form, setForm] = useState<CouponForm>(blank)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (isPending) return <p className="text-muted-foreground">Carregando cupons...</p>
  if (error || !data) return <p role="alert" className="text-destructive">Não foi possível carregar os cupons: {error?.message}</p>

  const storeName = (storeId: string | null) => storeId
    ? data.stores.find((store) => store.id === storeId)?.name ?? 'Loja removida'
    : 'Todas as lojas'

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return data.coupons.filter((coupon) => {
      const expired = Boolean(coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now())
      const linked = data.offers.some((offer) => offer.coupon_id === coupon.id)
      const text = `${coupon.code} ${coupon.description ?? ''} ${storeName(coupon.store_id)}`.toLowerCase()
      const matchesText = !term || text.includes(term)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'verified' && coupon.active && coupon.verified && !expired) ||
        (filter === 'unverified' && coupon.active && !coupon.verified && !expired) ||
        (filter === 'expired' && expired) ||
        (filter === 'linked' && linked) ||
        (filter === 'inactive' && !coupon.active)
      return matchesText && matchesFilter
    })
  }, [data, filter, search])

  const now = Date.now()
  const verified = data.coupons.filter((coupon) =>
    coupon.active &&
    coupon.verified &&
    (!coupon.expires_at || new Date(coupon.expires_at).getTime() > now),
  ).length
  const expiring = data.coupons.filter((coupon) => {
    if (!coupon.active || !coupon.expires_at) return false
    const expiry = new Date(coupon.expires_at).getTime()
    return expiry > now && expiry <= now + 7 * 86_400_000
  }).length
  const linkedOffers = data.offers.filter((offer) => offer.coupon_id).length

  function open(coupon?: Coupon) {
    setEditing(coupon ?? null)
    setMessage('')
    setForm(coupon ? {
      store_id: coupon.store_id ?? '',
      code: coupon.code,
      description: coupon.description ?? '',
      discount_type: coupon.discount_type ?? 'percent',
      discount_value: coupon.discount_value == null ? '' : String(coupon.discount_value),
      minimum_purchase: coupon.minimum_purchase == null ? '' : String(coupon.minimum_purchase),
      max_discount: coupon.max_discount == null ? '' : String(coupon.max_discount),
      expires_at: toLocalInput(coupon.expires_at),
      source_url: coupon.source_url ?? '',
      notes: coupon.notes ?? '',
      verified: coupon.verified,
      active: coupon.active,
    } : { ...blank })
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-data'] })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setMessage('')

    const code = form.code.trim().toUpperCase()
    if (!code) {
      setMessage('Informe o código do cupom.')
      return
    }

    if (!['percent', 'fixed', 'shipping'].includes(form.discount_type)) {
      setMessage('Escolha um tipo de desconto válido.')
      return
    }

    const discountValue = form.discount_type === 'shipping' ? 0 : Number(form.discount_value)
    if (form.discount_type !== 'shipping' && (!Number.isFinite(discountValue) || discountValue <= 0)) {
      setMessage('Informe um valor de desconto maior que zero.')
      return
    }
    if (form.discount_type === 'percent' && discountValue > 100) {
      setMessage('Desconto percentual não pode ultrapassar 100%.')
      return
    }

    const duplicate = data!.coupons.find((coupon) =>
      coupon.id !== editing?.id &&
      coupon.code.toLowerCase() === code.toLowerCase() &&
      (coupon.store_id ?? '') === form.store_id,
    )
    if (duplicate) {
      setMessage('Já existe um cupom com esse código para a mesma loja.')
      return
    }

    const minimum = form.minimum_purchase.trim() ? Number(form.minimum_purchase) : null
    const maxDiscount = form.discount_type === 'percent' && form.max_discount.trim()
      ? Number(form.max_discount)
      : null

    if (minimum != null && (!Number.isFinite(minimum) || minimum < 0)) {
      setMessage('Valor mínimo inválido.')
      return
    }
    if (maxDiscount != null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) {
      setMessage('Teto de desconto inválido.')
      return
    }

    const payload = {
      store_id: form.store_id || null,
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: discountValue,
      minimum_purchase: minimum,
      max_discount: maxDiscount,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      source_url: form.source_url.trim() || null,
      notes: form.notes.trim() || null,
      verified: form.verified,
      active: form.active,
      last_verified_at: form.verified
        ? (editing?.verified && editing.last_verified_at ? editing.last_verified_at : new Date().toISOString())
        : null,
      last_error: null,
    }

    setSaving(true)
    const result = editing
      ? await supabase.from('coupons').update(payload).eq('id', editing.id)
      : await supabase.from('coupons').insert(payload)
    setSaving(false)

    if (result.error) {
      setMessage(result.error.message)
      return
    }

    setEditing(undefined)
    await refresh()
  }

  async function toggleVerified(coupon: Coupon) {
    const next = !coupon.verified
    const result = await supabase
      .from('coupons')
      .update({
        verified: next,
        last_verified_at: next ? new Date().toISOString() : null,
        last_error: null,
      })
      .eq('id', coupon.id)

    if (result.error) setMessage(result.error.message)
    else await refresh()
  }

  async function toggleActive(coupon: Coupon) {
    const result = await supabase
      .from('coupons')
      .update({ active: !coupon.active })
      .eq('id', coupon.id)
    if (result.error) setMessage(result.error.message)
    else await refresh()
  }

  async function remove(coupon: Coupon) {
    const linked = data!.offers.filter((offer) => offer.coupon_id === coupon.id).length
    const detail = linked ? ` Ele está vinculado a ${linked} oferta(s); o vínculo será removido.` : ''
    if (!window.confirm(`Excluir o cupom ${coupon.code}?${detail}`)) return
    const result = await supabase.from('coupons').delete().eq('id', coupon.id)
    if (result.error) setMessage(result.error.message)
    else await refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre apenas cupons reais, verifique a validade e vincule-os às ofertas monitoradas.
          </p>
        </div>
        <Button onClick={() => open()}><Plus size={16} /> Adicionar cupom</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Cadastrados <Tags size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{data.coupons.length}</p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Verificados válidos <BadgeCheck size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{verified}</p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Expiram em 7 dias <CalendarClock size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{expiring}</p>
        </div>
        <div className="border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm text-muted-foreground">Ofertas com cupom <Tags size={18} /></div>
          <p className="mt-4 text-3xl font-semibold">{linkedOffers}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[280px] max-w-lg flex-1 items-center gap-2 border border-border bg-card px-3 py-2 text-muted-foreground">
          <Search size={17} />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar código, loja ou descrição..."
            className="h-7 border-0 bg-transparent shadow-none"
          />
        </div>
        <select
          aria-label="Filtrar cupons"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="h-11 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">Todos</option>
          <option value="verified">Verificados</option>
          <option value="unverified">Não verificados</option>
          <option value="expired">Expirados</option>
          <option value="linked">Vinculados</option>
          <option value="inactive">Desativados</option>
        </select>
      </div>

      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}

      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
            <tr>
              {['Cupom', 'Loja', 'Desconto', 'Compra mínima', 'Validade', 'Status', 'Ofertas', 'Ações'].map((label) => (
                <th key={label} className="px-4 py-3 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((coupon) => {
              const status = couponStatus(coupon)
              const linked = data.offers.filter((offer) => offer.coupon_id === coupon.id).length
              return (
                <tr key={coupon.id} className="border-b border-border/70 last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold">{coupon.code}</p>
                    <p className="max-w-[260px] truncate text-xs text-muted-foreground" title={coupon.description ?? ''}>{coupon.description ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">{storeName(coupon.store_id)}</td>
                  <td className="px-4 py-3 font-medium">{couponLabel(coupon)}</td>
                  <td className="px-4 py-3">{coupon.minimum_purchase == null ? '—' : money(Number(coupon.minimum_purchase))}</td>
                  <td className="px-4 py-3">
                    {coupon.expires_at
                      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(coupon.expires_at))
                      : 'Sem expiração'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex border px-2 py-1 text-xs font-medium ${status.cls}`}>{status.label}</span>
                    {coupon.last_verified_at && <p className="mt-1 text-[11px] text-muted-foreground">checado {new Date(coupon.last_verified_at).toLocaleDateString('pt-BR')}</p>}
                  </td>
                  <td className="px-4 py-3">{linked}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleVerified(coupon)}>
                        {coupon.verified ? 'Desverificar' : 'Verificar'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(coupon)}>
                        {coupon.active ? 'Desativar' : 'Ativar'}
                      </Button>
                      {coupon.source_url && (
                        <Button variant="ghost" size="icon" title="Abrir fonte" asChild>
                          <a href={coupon.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /></a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => open(coupon)}><Pencil size={16} /></Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => remove(coupon)}><Trash2 size={16} /></Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!rows.length && <p className="px-4 py-10 text-center text-muted-foreground">Nenhum cupom encontrado.</p>}
      </div>

      <Dialog open={editing !== undefined} onOpenChange={(openDialog) => { if (!openDialog) setEditing(undefined) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cupom' : 'Adicionar cupom'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Código
                <Input className="mt-1.5 font-mono uppercase" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
              </label>
              <label className="block text-sm font-medium">
                Loja
                <select value={form.store_id} onChange={(event) => setForm({ ...form, store_id: event.target.value })} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Todas as lojas</option>
                  {data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium">
              Descrição
              <Input className="mt-1.5" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ex.: 10% OFF em informática" />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                Tipo
                <select value={form.discount_type} onChange={(event) => setForm({ ...form, discount_type: event.target.value })} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="percent">Percentual</option>
                  <option value="fixed">Valor fixo</option>
                  <option value="shipping">Frete grátis</option>
                </select>
              </label>
              <label className="block text-sm font-medium">
                {form.discount_type === 'percent' ? 'Percentual' : 'Valor do desconto'}
                <Input
                  className="mt-1.5"
                  type="number"
                  min="0"
                  max={form.discount_type === 'percent' ? '100' : undefined}
                  step="0.01"
                  disabled={form.discount_type === 'shipping'}
                  value={form.discount_type === 'shipping' ? '0' : form.discount_value}
                  onChange={(event) => setForm({ ...form, discount_value: event.target.value })}
                />
              </label>
              <label className="block text-sm font-medium">
                Teto de desconto
                <Input
                  className="mt-1.5"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={form.discount_type !== 'percent'}
                  value={form.discount_type === 'percent' ? form.max_discount : ''}
                  onChange={(event) => setForm({ ...form, max_discount: event.target.value })}
                  placeholder="Opcional"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Compra mínima
                <Input className="mt-1.5" type="number" min="0" step="0.01" value={form.minimum_purchase} onChange={(event) => setForm({ ...form, minimum_purchase: event.target.value })} placeholder="Opcional" />
              </label>
              <label className="block text-sm font-medium">
                Expira em
                <Input className="mt-1.5" type="datetime-local" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Fonte / página onde o cupom foi confirmado
              <Input className="mt-1.5" type="url" value={form.source_url} onChange={(event) => setForm({ ...form, source_url: event.target.value })} placeholder="https://..." />
            </label>

            <label className="block text-sm font-medium">
              Observações
              <Textarea className="mt-1.5 min-h-24" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Categorias, restrições, formas de pagamento..." />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between border border-border bg-background p-4">
                <div>
                  <p className="text-sm font-medium">Verificado</p>
                  <p className="text-xs text-muted-foreground">Confirme somente depois de validar o cupom.</p>
                </div>
                <Switch checked={form.verified} onCheckedChange={(value) => setForm({ ...form, verified: value })} />
              </div>
              <div className="flex items-center justify-between border border-border bg-background p-4">
                <div>
                  <p className="text-sm font-medium">Ativo</p>
                  <p className="text-xs text-muted-foreground">Permite que o motor aplique o cupom.</p>
                </div>
                <Switch checked={form.active} onCheckedChange={(value) => setForm({ ...form, active: value })} />
              </div>
            </div>

            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(undefined)}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar cupom'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}