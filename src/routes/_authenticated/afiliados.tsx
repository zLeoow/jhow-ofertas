import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CircleDollarSign, Link2, Pencil, Search, ShieldAlert, Sparkles, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/integrations/supabase/client'
import { latestScore, type AdminData } from '@/components/jhow/data'
import { useAdmin } from '@/components/jhow/useAdmin'
import {
  affiliateSettingsFromJson,
  affiliateStatus,
  buildAffiliateUrl,
  defaultAffiliateSettings,
  isHttpUrl,
  type AffiliateSettings,
} from '@/components/jhow/affiliates'
import type { Json } from '@/integrations/supabase/types'

type Store = AdminData['stores'][number]
type Offer = AdminData['offers'][number]

export const Route = createFileRoute('/_authenticated/afiliados')({
  head: () => ({
    meta: [
      { title: 'Afiliados — Jhow Ofertas' },
      { name: 'description', content: 'Gerencie programas e links de afiliado usados nas publicações.' },
    ],
  }),
  component: AffiliatesPage,
})

function AffiliatesPage() {
  const { data, isPending, error } = useAdmin()
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<AffiliateSettings | null>(null)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [storeProgram, setStoreProgram] = useState('')
  const [storeTemplate, setStoreTemplate] = useState('')
  const [storeNotes, setStoreNotes] = useState('')
  const [storeEnabled, setStoreEnabled] = useState(false)
  const [storeRequired, setStoreRequired] = useState(false)
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null)
  const [affiliateUrl, setAffiliateUrl] = useState('')
  const [saving, setSaving] = useState(false)

  if (isPending) return <p className="text-muted-foreground">Carregando afiliados...</p>
  if (error || !data) return <p role="alert" className="text-destructive">Não foi possível carregar afiliados: {error?.message}</p>

  const settingsRow = data.settings.find((item) => item.key === 'affiliate')
  const savedSettings = affiliateSettingsFromJson(settingsRow?.value)
  const settings = settingsDraft ?? savedSettings
  const productName = (id: string) => data.products.find((item) => item.id === id)?.name ?? 'Produto removido'
  const storeFor = (id: string) => data.stores.find((item) => item.id === id)
  const storeName = (id: string) => storeFor(id)?.name ?? 'Loja removida'

  const offersWithStatus = data.offers.map((offer) => {
    const store = storeFor(offer.store_id)
    const status = store
      ? affiliateStatus(offer, store, settings)
      : { key: 'invalid' as const, label: 'Loja ausente', eligible: false, reason: 'Loja não encontrada.' }
    return { offer, store, status }
  })

  const filteredOffers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return offersWithStatus.filter(({ offer, store, status }) => {
      const text = `${productName(offer.product_id)} ${store?.name ?? ''} ${offer.affiliate_url ?? ''} ${offer.affiliate_source ?? ''}`.toLowerCase()
      const matchesText = !term || text.includes(term)
      const matchesFilter =
        filter === 'all' ||
        filter === status.key ||
        (filter === 'eligible' && status.eligible) ||
        (filter === 'missing' && !offer.affiliate_url)
      return matchesText && matchesFilter
    })
  }, [data, filter, search, settings])

  const enabledStores = data.stores.filter((store) => store.affiliate_enabled).length
  const withLink = data.offers.filter((offer) => Boolean(offer.affiliate_url)).length
  const verified = data.offers.filter((offer) => offer.affiliate_verified).length
  const missingEligible = offersWithStatus.filter(({ offer, status }) => offer.active && !status.eligible).length

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['admin-data'] })
  }

  async function saveGlobalSettings() {
    setSavingSettings(true)
    setMessage('')
    const result = await supabase.from('settings').upsert({
      key: 'affiliate',
      value: settings as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    setSavingSettings(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setSettingsDraft(null)
    setMessage('Regras globais de afiliados salvas.')
    await refresh()
  }

  function openStore(store: Store) {
    setEditingStore(store)
    setStoreProgram(store.affiliate_program ?? '')
    setStoreTemplate(store.affiliate_template ?? '')
    setStoreNotes(store.affiliate_notes ?? '')
    setStoreEnabled(store.affiliate_enabled)
    setStoreRequired(store.affiliate_required)
    setMessage('')
  }

  async function saveStore(event: FormEvent) {
    event.preventDefault()
    if (!editingStore) return
    setSaving(true)
    const result = await supabase
      .from('stores')
      .update({
        affiliate_enabled: storeEnabled,
        affiliate_required: storeRequired,
        affiliate_program: storeProgram.trim() || null,
        affiliate_template: storeTemplate.trim() || null,
        affiliate_notes: storeNotes.trim() || null,
      })
      .eq('id', editingStore.id)
    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setEditingStore(null)
    await refresh()
  }

  function openOffer(offer: Offer) {
    setEditingOffer(offer)
    setAffiliateUrl(offer.affiliate_url ?? '')
    setMessage('')
  }

  async function saveManualAffiliate(event: FormEvent) {
    event.preventDefault()
    if (!editingOffer) return
    const value = affiliateUrl.trim()
    if (!isHttpUrl(value)) {
      setMessage('Informe um link http:// ou https:// válido.')
      return
    }
    setSaving(true)
    const result = await supabase
      .from('product_offers')
      .update({
        affiliate_url: value,
        affiliate_source: 'manual',
        affiliate_verified: false,
        affiliate_verified_at: null,
        affiliate_last_error: null,
      })
      .eq('id', editingOffer.id)
    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return
    }
    setEditingOffer(null)
    setMessage('Link salvo. Verifique antes de publicar.')
    await refresh()
  }

  async function generateFromTemplate(offer: Offer) {
    const store = storeFor(offer.store_id)
    if (!store) return
    setMessage('')
    try {
      const generated = buildAffiliateUrl(store.affiliate_template ?? '', offer, store)
      const result = await supabase
        .from('product_offers')
        .update({
          affiliate_url: generated,
          affiliate_source: 'template',
          affiliate_verified: false,
          affiliate_verified_at: null,
          affiliate_last_error: null,
        })
        .eq('id', offer.id)
      if (result.error) throw result.error
      setMessage('Link gerado pelo template. Ele ficou pendente de verificação.')
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Não foi possível gerar o link.')
    }
  }

  async function verifyAffiliate(offer: Offer) {
    const store = storeFor(offer.store_id)
    if (!store?.affiliate_enabled) {
      setMessage('Ative o programa de afiliados da loja antes de verificar o link.')
      return
    }
    if (!isHttpUrl(offer.affiliate_url)) {
      setMessage('O link atual não é uma URL http/https válida.')
      return
    }
    const result = await supabase
      .from('product_offers')
      .update({
        affiliate_verified: true,
        affiliate_verified_at: new Date().toISOString(),
        affiliate_last_error: null,
      })
      .eq('id', offer.id)
    if (result.error) setMessage(result.error.message)
    else {
      setMessage('Link de afiliado verificado.')
      await refresh()
    }
  }

  async function invalidateAffiliate(offer: Offer) {
    const reason = window.prompt('Motivo da invalidação:', offer.affiliate_last_error ?? 'Falha na validação manual')
    if (reason === null) return
    const result = await supabase
      .from('product_offers')
      .update({
        affiliate_verified: false,
        affiliate_verified_at: null,
        affiliate_last_error: reason.trim() || 'Marcado como inválido pelo administrador',
      })
      .eq('id', offer.id)
    if (result.error) setMessage(result.error.message)
    else {
      setMessage('Link marcado como inválido.')
      await refresh()
    }
  }

  async function clearAffiliate(offer: Offer) {
    if (!window.confirm('Limpar o link de afiliado desta oferta?')) return
    const result = await supabase
      .from('product_offers')
      .update({
        affiliate_url: null,
        affiliate_source: null,
        affiliate_verified: false,
        affiliate_verified_at: null,
        affiliate_last_error: null,
      })
      .eq('id', offer.id)
    if (result.error) setMessage(result.error.message)
    else await refresh()
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-semibold">Afiliados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Controle quais links monetizados podem entrar nas publicações do Jhow Ofertas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Lojas habilitadas" value={enabledStores} icon={<CircleDollarSign size={18} />} />
        <Metric label="Ofertas com link" value={withLink} icon={<Link2 size={18} />} />
        <Metric label="Links verificados" value={verified} icon={<BadgeCheck size={18} />} />
        <Metric label="Ativas sem afiliado elegível" value={missingEligible} icon={<ShieldAlert size={18} />} />
      </div>

      {message && <div className="border border-border bg-card p-3 text-sm text-muted-foreground">{message}</div>}

      <section className="border border-border bg-card p-5">
        <div className="mb-5">
          <h2 className="font-semibold">Regras globais</h2>
          <p className="mt-1 text-xs text-muted-foreground">Definem quando o Telegram pode publicar uma oferta sem monetização.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <ToggleCard
            title="Exigir afiliado para publicação"
            description="Bloqueia ofertas sem link afiliado elegível."
            checked={settings.require_affiliate_for_publication}
            onChange={(value) => setSettingsDraft({ ...settings, require_affiliate_for_publication: value })}
          />
          <ToggleCard
            title="Permitir URL normal"
            description="Só é usada quando afiliado não é obrigatório."
            checked={settings.allow_offer_url_fallback}
            onChange={(value) => setSettingsDraft({ ...settings, allow_offer_url_fallback: value })}
          />
          <ToggleCard
            title="Exigir link verificado"
            description="Link pendente não é considerado elegível."
            checked={settings.require_verified_affiliate}
            onChange={(value) => setSettingsDraft({ ...settings, require_verified_affiliate: value })}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={saveGlobalSettings} disabled={savingSettings}>{savingSettings ? 'Salvando...' : 'Salvar regras'}</Button>
          <Button variant="outline" onClick={() => setSettingsDraft({ ...defaultAffiliateSettings })}>Padrão seguro</Button>
        </div>
      </section>

      <section className="border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">Programas por loja</h2>
          <p className="mt-1 text-xs text-muted-foreground">Templates são públicos e não devem conter tokens secretos.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>{['Loja', 'Programa', 'Habilitado', 'Obrigatório', 'Template', 'Cobertura', 'Ações'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {data.stores.map((store) => {
                const storeOffers = offersWithStatus.filter((item) => item.offer.store_id === store.id && item.offer.active)
                const eligible = storeOffers.filter((item) => item.status.eligible).length
                return (
                  <tr key={store.id} className="border-t border-border/70">
                    <td className="px-4 py-3 font-medium">{store.name}</td>
                    <td className="px-4 py-3">{store.affiliate_program ?? '—'}</td>
                    <td className="px-4 py-3">{store.affiliate_enabled ? <span className="text-success">Sim</span> : 'Não'}</td>
                    <td className="px-4 py-3">{store.affiliate_required ? 'Sim' : 'Não'}</td>
                    <td className="max-w-[330px] px-4 py-3 font-mono text-xs text-muted-foreground">{store.affiliate_template ?? '—'}</td>
                    <td className="px-4 py-3">{eligible}/{storeOffers.length}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => openStore(store)}><Pencil size={15} /> Editar</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-[280px] max-w-lg flex-1 items-center gap-2 border border-border bg-card px-3 py-2 text-muted-foreground">
            <Search size={17} />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, loja ou link..." className="h-7 border-0 bg-transparent shadow-none" />
          </div>
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-11 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">Todos os links</option>
            <option value="eligible">Elegíveis</option>
            <option value="pending">Não verificados</option>
            <option value="missing">Ausentes</option>
            <option value="invalid">Inválidos</option>
            <option value="disabled">Loja desativada</option>
          </select>
        </div>

        <div className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>{['Produto', 'Loja', 'URL original', 'Affiliate URL', 'Origem', 'Verificação', 'Score', 'Ações'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {filteredOffers.map(({ offer, store, status }) => (
                <tr key={offer.id} className="border-b border-border/70 last:border-0 align-top">
                  <td className="px-4 py-3 font-medium">{productName(offer.product_id)}</td>
                  <td className="px-4 py-3">{store?.name ?? '—'}</td>
                  <td className="max-w-[220px] px-4 py-3"><a href={offer.url} target="_blank" rel="noopener noreferrer" className="block truncate text-primary" title={offer.url}>{offer.url}</a></td>
                  <td className="max-w-[280px] px-4 py-3">{offer.affiliate_url ? <a href={offer.affiliate_url} target="_blank" rel="noopener noreferrer" className="block truncate text-primary" title={offer.affiliate_url}>{offer.affiliate_url}</a> : '—'}</td>
                  <td className="px-4 py-3">{offer.affiliate_source ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={status.eligible ? 'font-medium text-success' : status.key === 'invalid' ? 'font-medium text-destructive' : 'text-muted-foreground'}>{status.label}</span>
                    {offer.affiliate_verified_at && <p className="mt-1 text-[11px] text-muted-foreground">{new Date(offer.affiliate_verified_at).toLocaleString('pt-BR')}</p>}
                    {offer.affiliate_last_error && <p className="mt-1 max-w-[220px] text-xs text-destructive">{offer.affiliate_last_error}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-primary">{latestScore(data, offer.id)?.score ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openOffer(offer)}><Pencil size={14} /> Editar</Button>
                      <Button size="sm" variant="ghost" disabled={!store?.affiliate_template} onClick={() => generateFromTemplate(offer)}><Sparkles size={14} /> Gerar</Button>
                      <Button size="sm" variant="ghost" disabled={!offer.affiliate_url || offer.affiliate_verified} onClick={() => verifyAffiliate(offer)}><BadgeCheck size={14} /> Verificar</Button>
                      <Button size="sm" variant="ghost" disabled={!offer.affiliate_url} onClick={() => invalidateAffiliate(offer)}>Invalidar</Button>
                      <Button size="icon" variant="ghost" title="Limpar link" disabled={!offer.affiliate_url} onClick={() => clearAffiliate(offer)}><Unlink size={15} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredOffers.length && <p className="px-4 py-10 text-center text-muted-foreground">Nenhuma oferta encontrada.</p>}
        </div>
      </section>

      <Dialog open={editingStore !== null} onOpenChange={(open) => { if (!open) setEditingStore(null) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Programa de afiliados · {editingStore?.name}</DialogTitle></DialogHeader>
          <form onSubmit={saveStore} className="space-y-4">
            <label className="block text-sm font-medium">Programa<Input className="mt-1.5" value={storeProgram} onChange={(event) => setStoreProgram(event.target.value)} placeholder="Ex.: Mercado Livre Afiliados" /></label>
            <label className="block text-sm font-medium">Template de deep-link<Input className="mt-1.5 font-mono text-xs" value={storeTemplate} onChange={(event) => setStoreTemplate(event.target.value)} placeholder="https://exemplo.com/?url={{url_encoded}}" /></label>
            <p className="text-xs text-muted-foreground">Tokens: {'{{url}}'}, {'{{url_encoded}}'}, {'{{offer_id}}'}, {'{{product_id}}'}, {'{{store_slug}}'}.</p>
            <label className="block text-sm font-medium">Observações<Textarea className="mt-1.5 min-h-24" value={storeNotes} onChange={(event) => setStoreNotes(event.target.value)} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleCard title="Programa habilitado" description="Permite links desta loja." checked={storeEnabled} onChange={setStoreEnabled} />
              <ToggleCard title="Afiliado obrigatório" description="Bloqueia fallback nesta loja." checked={storeRequired} onChange={setStoreRequired} />
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingStore(null)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingOffer !== null} onOpenChange={(open) => { if (!open) setEditingOffer(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar link de afiliado</DialogTitle></DialogHeader>
          <form onSubmit={saveManualAffiliate} className="space-y-4">
            <label className="block text-sm font-medium">Affiliate URL<Input className="mt-1.5" type="url" value={affiliateUrl} onChange={(event) => setAffiliateUrl(event.target.value)} placeholder="https://..." required /></label>
            <p className="text-xs text-muted-foreground">Salvar manualmente sempre volta o link para “não verificado”.</p>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditingOffer(null)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar link'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="border border-border bg-card p-5"><div className="flex items-center justify-between text-sm text-muted-foreground">{label}{icon}</div><p className="mt-4 text-3xl font-semibold">{value}</p></div>
}

function ToggleCard({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 border border-border bg-background p-4"><div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onChange} /></div>
}
