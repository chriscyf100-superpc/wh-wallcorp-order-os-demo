import { seedPriceLog } from './priceUpdate.ts'
import { seedInventory } from './inventory.ts'
import { withDocuments } from './documents.ts'
import { seedBuckets, seedPayments } from './payments.ts'
import { creditVerdict } from './credit.ts'
import { seedAdjustments, seedSalespeople } from './commissionSeed.ts'
import { lockOrderLines, todayISO, zoneForClient } from './pricedesk.ts'
import { seedPriceRows, seedProducts } from './priceDeskSeed.ts'
import { seedPriceSheets } from './tileSheet.ts'
import { orderTotal, priceForQty } from './pricing.ts'
import type { Client, DeskData, Order, OrderLine, Sku, WaMessage } from './types.ts'

function pastToday(minutesAgo: number, clampMinute: number): string {
  const now = new Date()
  const stamp = new Date(now.getTime() - minutesAgo * 60_000)
  if (stamp.toDateString() !== now.toDateString()) {
    const clamped = new Date(now)
    clamped.setHours(0, Math.min(clampMinute, 59), 0, 0)
    if (clamped.getTime() >= now.getTime()) {
      return new Date(now.getTime() - (clampMinute + 1) * 1000).toISOString()
    }
    return clamped.toISOString()
  }
  return stamp.toISOString()
}

function yesterdayAt(hours: number, minutes: number): string {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  date.setHours(hours, minutes, 0, 0)
  return date.toISOString()
}

function abc(a: number, b: number, c: number, breaks: [number, number] = [15, 20]) {
  return [
    { minQty: 1, price: a, label: 'Price A' },
    { minQty: breaks[0], price: b, label: 'Price B' },
    { minQty: breaks[1], price: c, label: 'Price C' },
  ]
}

function makeSkus(): Sku[] {
  return [
    {
      id: 'red-brick',
      code: 'RED-BRICK',
      name: 'W&H solid clay brick',
      nameZh: '红砖',
      aliases: ['w&h clay brick', 'red clay brick', 'red brick', 'clay brick', '红砖', '砖'],
      unit: 'bundle',
      unitZh: '扎',
      stock: 'enough',
      tiers: abc(52, 46, 42),
    },
    {
      id: 'paver',
      code: 'PAVER',
      name: 'W&H interlock paver',
      nameZh: '水泥地砖',
      aliases: ['cement paver', 'paver', '水泥地砖', '地砖', '砖仔'],
      unit: 'bundle',
      unitZh: '扎',
      stock: 'enough',
      tiers: abc(28, 25, 23),
    },
    {
      id: 'river-sand',
      code: 'RIVER-SAND',
      name: 'River sand (washed)',
      nameZh: '河沙',
      aliases: ['river sand', 'pasir', '河沙', '砂', '沙'],
      unit: 'load',
      unitZh: '车',
      stock: 'low',
      tiers: abc(280, 260, 245, [3, 5]),
    },
    {
      id: 'stone',
      code: 'STONE',
      name: 'Granite aggregate 3/4',
      nameZh: '石仔',
      aliases: ['quarry stone', 'quarry', 'batu', '碎石', '石仔'],
      unit: 'load',
      unitZh: '车',
      stock: 'enough',
      tiers: abc(320, 300, 285, [3, 5]),
    },
    {
      id: 'cement',
      code: 'CEMENT-50',
      name: 'Portland cement 50kg',
      nameZh: '洋灰',
      aliases: ['portland cement', 'simen', '洋灰', '水泥'],
      unit: 'bag',
      unitZh: '包',
      stock: 'low',
      tiers: abc(22, 20.5, 19.4, [30, 100]),
    },
    {
      id: 'emix',
      code: 'EMIX-SKIM',
      name: 'W&H A-plas mortar additive 25kg',
      nameZh: 'A-plas外加剂',
      aliases: ['a-plas', 'a plas', 'w&h a-plas', 'mortar additive', 'aditif mortar', '外加剂', '灰'],
      unit: 'bag',
      unitZh: '包',
      stock: 'enough',
      tiers: abc(18.5, 17.2, 16.4, [20, 50]),
    },
    {
      id: 'oka-300',
      code: 'OKA-300',
      name: 'Precast concrete pipe 300mm',
      nameZh: '预制水泥管',
      aliases: ['concrete pipe 300', 'precast pipe 300', 'paip konkrit', '水泥管', '预制水泥管'],
      unit: 'pcs',
      unitZh: '条',
      stock: 'enough',
      tiers: abc(38, 34, 31),
    },
    {
      id: 'u-drain',
      code: 'U-DRAIN',
      name: 'Precast U-drain 300mm',
      nameZh: 'U形排水沟',
      aliases: ['precast u-drain', 'u-drain', 'u drain', 'udrain', 'longkang', 'u形排水沟', '排水沟'],
      unit: 'pcs',
      unitZh: '条',
      stock: 'enough',
      tiers: abc(26, 23.5, 21),
    },
    {
      id: 'cem-board',
      code: 'CEM-BOARD',
      name: 'W&H WallCore board 4×8',
      nameZh: 'WallCore板',
      aliases: ['wallcore board', 'w&h wallcore', 'cement board', 'cementboard', 'papan simen', '水泥板'],
      unit: 'pcs',
      unitZh: '片',
      stock: 'enough',
      tiers: abc(32, 29, 27),
    },
    {
      id: 'y12',
      code: 'Y12',
      name: 'Y12 rebar',
      nameZh: '铁枝',
      aliases: ['y12 rebar', 'besi y12', 'rebar', 'y12', '钢筋', '铁枝'],
      unit: 'bundle',
      unitZh: '扎',
      stock: 'out',
      tiers: abc(185, 172, 165),
    },
    {
      id: 'brc',
      code: 'BRC-A7',
      name: 'BRC wire mesh A7',
      nameZh: '铁网',
      aliases: ['brc wire mesh', 'wire mesh', 'brc', '铁网'],
      unit: 'bundle',
      unitZh: '扎',
      stock: 'low',
      tiers: abc(95, 88, 82),
    },
  ]
}

const DEBTOR: Record<string, { debtorNo: string; address: string; termDays: number }> = {
  'bina-maju': { debtorNo: '300B001', address: 'NO.12, JALAN MERANTI 4, TAMAN SUBANG PERDANA, 47500 SUBANG JAYA, SELANGOR', termDays: 30 },
  'kedah-construction': { debtorNo: '300K002', address: 'LOT 88, JALAN USAHAWAN 5, 40150 SHAH ALAM, SELANGOR', termDays: 60 },
  'as-hardware': { debtorNo: '300A003', address: 'NO.26, JALAN SS14/2, 47500 SUBANG JAYA, SELANGOR', termDays: 30 },
  utara: { debtorNo: '300P039', address: 'NO.26, JALAN TPP 1/3, TAMAN PERINDUSTRIAN PUCHONG, 47100 PUCHONG, SELANGOR', termDays: 60 },
  idaman: { debtorNo: '300I005', address: 'NO.3, JALAN USJ 10/1E, 47620 SUBANG JAYA, SELANGOR', termDays: 30 },
  mega: { debtorNo: '300M006', address: 'LOT 5, JALAN MERU INDUSTRI 2, 41050 KLANG, SELANGOR', termDays: 90 },
}

function makeClients(): Client[] {
  return makeClientRows().map((client, index) => {
    const extra = DEBTOR[client.id]
    return {
      ...client,
      debtorNo: extra?.debtorNo ?? `300X${String(index + 1).padStart(3, '0')}`,
      address: extra?.address ?? `${client.area.toUpperCase()}, MALAYSIA`,
      termDays: extra?.termDays ?? 30,
    }
  })
}

// Regular accounts with clean books, so the customer breakdown looks like a real ledger.
// [id, company, area, limit, outstanding, phone]
const REGULARS: [string, string, string, number, number, string][] = [
  ['jitra-hardware', 'Setia Buildmart', 'Shah Alam', 18000, 4200, '03-5519 1188'],
  ['kepala-batas-build', 'Prima Wall Products', 'Petaling Jaya', 25000, 7600, '03-7721 4520'],
  ['tokai-renovation', 'Urban Mortar Works', 'Subang Jaya', 12000, 2100, '03-5639 3302'],
  ['gurun-construction', 'Meru Construction Sdn Bhd', 'Klang', 35000, 11800, '03-3392 2290'],
  ['simpang-empat-trading', 'Crestline Trading', 'Puchong', 15000, 0, '03-8064 6610'],
  ['changlun-builders', 'Metroline Builders', 'Cyberjaya', 20000, 3500, '03-8317 1175'],
  ['kodiang-maju', 'Aman Maju Enterprise', 'Kajang', 10000, 0, '03-8738 8803'],
  ['pendang-perumahan', 'Perdana Housing Sdn Bhd', 'Kota Kemuning', 42000, 15400, '03-5123 1020'],
]

function makeClientRows(): Client[] {
  return [
    {
      id: 'bina-maju',
      company: 'Nusantara Buildmart Sdn Bhd',
      aliases: ['nusantara buildmart', 'buildmart', '努山塔拉建材'],
      creditLimit: 28000,
      outstanding: 8400,
      ageing: 'ok',
      area: 'Shah Alam',
      phone: '03-5510 2201',
    },
    {
      id: 'kedah-construction',
      company: 'Metro Crest Construction Sdn Bhd',
      aliases: ['metro crest construction', 'metro crest', '都会建筑'],
      creditLimit: 40000,
      outstanding: 18600,
      ageing: '60',
      area: 'Klang',
      phone: '03-3390 1180',
    },
    {
      id: 'as-hardware',
      company: 'Buildmate Supplies Sdn Bhd',
      aliases: ['buildmate supplies', 'buildmate', '建材伙伴'],
      creditLimit: 20000,
      outstanding: 19600,
      ageing: 'ok',
      area: 'Subang Jaya',
      phone: '03-5632 4410',
    },
    {
      id: 'utara',
      company: 'Apex Build Solutions',
      aliases: ['apex build solutions', 'apex build'],
      creditLimit: 30000,
      outstanding: 6200,
      ageing: 'ok',
      area: 'Puchong',
      phone: '03-8068 5520',
    },
    {
      id: 'idaman',
      company: 'WallPro Renovation Enterprise',
      aliases: ['wallpro renovation', 'wallpro', '墙面专家'],
      creditLimit: 24000,
      outstanding: 6800,
      ageing: '30',
      area: 'USJ',
      phone: '03-8024 9088',
    },
    {
      id: 'mega',
      company: 'SolidMix Materials Sdn Bhd',
      aliases: ['solidmix materials', 'solidmix', '固力混合材料'],
      creditLimit: 36000,
      outstanding: 14200,
      ageing: '90',
      area: 'Meru, Klang',
      phone: '03-3341 3306',
    },
    {
      id: 'pokok-sena-trading',
      company: 'Sunline Trading',
      aliases: ['sunline trading'],
      creditLimit: 15000,
      outstanding: 0,
      ageing: 'ok',
      area: 'Rawang',
      phone: '03-6092 1104',
    },
    {
      id: 'sg-petani-builders',
      company: 'Subang Builders',
      aliases: ['subang builders', 'sb builders'],
      creditLimit: 32000,
      outstanding: 0,
      ageing: '30',
      area: 'Subang',
      phone: '03-5612 7790',
    },
    {
      id: 'kota-setar-premier',
      company: 'Premier Structura Sdn Bhd',
      aliases: ['premier structura'],
      creditLimit: 60000,
      outstanding: 0,
      ageing: 'ok',
      area: 'Shah Alam',
      phone: '03-5524 9921',
      whitelist: true,
    },
    {
      id: 'jitra-megaprojek',
      company: 'Megaprojek Nexus Sdn Bhd',
      aliases: ['megaprojek nexus'],
      creditLimit: 50000,
      outstanding: 0,
      ageing: 'ok',
      area: 'Cyberjaya',
      phone: '03-8320 8830',
    },
    {
      id: 'langkawi-works',
      company: 'Lagoonfront Works',
      aliases: ['lagoonfront works'],
      creditLimit: 45000,
      outstanding: 6000,
      ageing: '90',
      area: 'Setia Alam',
      phone: '03-3358 2210',
    },
    {
      id: 'yan-civil',
      company: 'Axis Civil Engineering',
      aliases: ['axis civil'],
      creditLimit: 26000,
      outstanding: 0,
      ageing: '30',
      area: 'Kota Damansara',
      phone: '03-6143 1305',
    },
    {
      id: 'kubang-pasu-dev',
      company: 'Urban Crest Developments',
      aliases: ['urban crest developments'],
      creditLimit: 38000,
      outstanding: 0,
      ageing: '60',
      area: 'Bandar Sunway',
      phone: '03-5637 2250',
    },
    ...REGULARS.map(([id, company, area, limit, outstanding, phone]) => ({
      id,
      company,
      aliases: [company.toLowerCase()],
      creditLimit: limit,
      outstanding,
      ageing: 'ok' as const,
      area,
      phone,
    })),
  ]
}

function line(skus: Sku[], id: string, skuId: string, qty: number): OrderLine {
  const sku = skus.find((row) => row.id === skuId)
  if (!sku) throw new Error(`Missing sku ${skuId}`)
  const priced = priceForQty(sku.tiers, qty)
  return { id, skuId, qty, unitPrice: priced.price, customPrice: false }
}

function hold(order: Order, clients: Client[]): Order {
  const client = clients.find((row) => row.id === order.clientId) ?? null
  const verdict = creditVerdict(client, orderTotal(order.lines))
  return { ...order, creditFlag: true, creditReason: verdict.reason }
}

// Seeded HQ Hold rows. The client's outstanding is set so this order lands `over` RM past the limit.
function heldOrder(
  skus: Sku[],
  clients: Client[],
  spec: { id: string; clientId: string; salesperson: string; skuId: string; qty: number; over: number; minutesAgo: number },
): Order {
  const l = line(skus, `L-${spec.id.slice(3)}-1`, spec.skuId, spec.qty)
  const client = clients.find((row) => row.id === spec.clientId)
  if (client && spec.over > 0) {
    client.outstanding = Math.max(0, Math.round((client.creditLimit + spec.over - orderTotal([l])) * 100) / 100)
  }
  const sku = skus.find((row) => row.id === spec.skuId)
  return hold(
    {
      id: spec.id,
      clientId: spec.clientId,
      source: 'text',
      stage: 'needs_approval',
      salesperson: spec.salesperson,
      createdAt: pastToday(spec.minutesAgo, 4 + (spec.minutesAgo % 50)),
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `${client?.company ?? ''}\n${sku?.nameZh ?? ''} ${spec.qty}${sku?.unitZh ?? ''}`,
      lines: [l],
    },
    clients,
  )
}

// Delivered orders from earlier months, so the Commission screen has invoices and payments to roll up.
// [id, salesperson, client, [sku, qty][], raised, invoiced, paid]
type History = [string, string, string, [string, number][], string, string, string | null]

const HISTORY: History[] = [
  ['WH-2301', 'Boon', 'idaman', [['red-brick', 400], ['cement', 300]], '2026-09-14', '2026-09-16', '2026-11-02'],
  ['WH-2302', 'Boon', 'bina-maju', [['u-drain', 500], ['stone', 60]], '2026-10-05', '2026-10-07', '2026-10-20'],
  ['WH-2303', 'Boon', 'utara', [['red-brick', 500], ['cement', 400]], '2026-10-12', '2026-10-14', '2026-11-03'],
  ['WH-2304', 'Lye Seng', 'kedah-construction', [['paver', 300], ['river-sand', 40]], '2026-10-08', '2026-10-09', '2026-10-23'],
  ['WH-2305', 'Lye Seng', 'as-hardware', [['cement', 600]], '2026-10-19', '2026-10-21', null],
  ['WH-2306', 'Han', 'mega', [['cem-board', 300], ['red-brick', 200]], '2026-10-10', '2026-10-12', '2026-10-30'],
  ['WH-2307', 'Han', 'idaman', [['stone', 40]], '2026-11-01', '2026-11-02', null],
]

function historyOrders(skus: Sku[]): Order[] {
  return HISTORY.map(([id, salesperson, clientId, items, raised, invoicedAt, paidAt]) => ({
    id,
    clientId,
    source: 'text' as const,
    stage: 'delivered' as const,
    salesperson,
    createdAt: `${raised}T09:00:00`,
    creditFlag: false,
    creditReason: null,
    approved: false,
    rawMessage: '',
    lines: items.map(([skuId, qty], i) => line(skus, `L-${id.slice(3)}-${i + 1}`, skuId, qty)),
    invoicedAt,
    paidAt,
  }))
}

function makeOrders(skus: Sku[], clients: Client[]): Order[] {
  const t = {
    idamanNew: pastToday(25, 8),
    utaraNew: pastToday(50, 12),
    hardware: pastToday(80, 16),
    kedah: pastToday(110, 20),
    utaraConfirmed: pastToday(160, 24),
    binaConfirmed: pastToday(200, 28),
    binaPrep: pastToday(250, 32),
    utaraPrep: pastToday(300, 36),
    cancelled: pastToday(40, 10),
    delivered: yesterdayAt(16, 10),
  }

  const orders: Order[] = [
    {
      id: 'WH-2401',
      clientId: 'idaman',
      source: 'text',
      stage: 'new',
      salesperson: 'Boon',
      createdAt: t.idamanNew,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `WallPro Renovation
水泥板 16片
W&H A-plas 10包
下午送到 USJ`,
      lines: [line(skus, 'L-2401-1', 'cem-board', 16), line(skus, 'L-2401-2', 'emix', 10)],
    },
    {
      id: 'WH-2402',
      clientId: 'utara',
      source: 'text',
      stage: 'new',
      salesperson: 'Lye Seng',
      createdAt: t.utaraNew,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `Apex Build Solutions
红砖 18扎
洋灰 36包
Subang 明天一早`,
      lines: [line(skus, 'L-2402-1', 'red-brick', 18), line(skus, 'L-2402-2', 'cement', 36)],
    },
    hold(
      {
        id: 'WH-2403',
        clientId: 'as-hardware',
        source: 'text',
        stage: 'needs_approval',
        salesperson: 'Han',
        createdAt: t.hardware,
        creditFlag: false,
        creditReason: null,
        approved: false,
        rawMessage: `Buildmate Supplies
OKA管 300mm 12条
U-drain 8条
这张单会冲过限额`,
        lines: [line(skus, 'L-2403-1', 'oka-300', 12), line(skus, 'L-2403-2', 'u-drain', 8)],
      },
      clients,
    ),
    hold(
      {
        id: 'WH-2404',
        clientId: 'kedah-construction',
        source: 'text',
        stage: 'needs_approval',
        salesperson: 'Boon',
        createdAt: t.kedah,
        creditFlag: false,
        creditReason: null,
        approved: false,
        rawMessage: `Metro Crest Construction
水泥板 24片
铁网 6扎
河沙 1车
工地在催，账还有 60 天`,
        lines: [
          line(skus, 'L-2404-1', 'cem-board', 24),
          line(skus, 'L-2404-2', 'brc', 6),
          line(skus, 'L-2404-3', 'river-sand', 1),
        ],
      },
      clients,
    ),
    {
      id: 'WH-2405',
      clientId: 'utara',
      source: 'text',
      stage: 'confirmed',
      salesperson: 'Lye Seng',
      createdAt: t.utaraConfirmed,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `Apex Build Solutions
红砖 20扎
洋灰 40包`,
      lines: [line(skus, 'L-2405-1', 'red-brick', 20), line(skus, 'L-2405-2', 'cement', 40)],
    },
    {
      id: 'WH-2406',
      clientId: 'bina-maju',
      source: 'text',
      stage: 'confirmed',
      salesperson: 'Boon',
      createdAt: t.binaConfirmed,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `Nusantara Buildmart
U-drain 12条`,
      lines: [line(skus, 'L-2406-1', 'u-drain', 12)],
    },
    {
      id: 'WH-2407',
      clientId: 'bina-maju',
      source: 'text',
      stage: 'preparing',
      salesperson: 'Han',
      createdAt: t.binaPrep,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `Nusantara Buildmart
河沙 2车
铁网 5扎
铁枝 Y12 4扎
星期五前`,
      lines: [
        line(skus, 'L-2407-1', 'river-sand', 2),
        line(skus, 'L-2407-2', 'brc', 5),
        line(skus, 'L-2407-3', 'y12', 4),
      ],
    },
    {
      id: 'WH-2408',
      clientId: 'utara',
      source: 'text',
      stage: 'preparing',
      salesperson: 'Lye Seng',
      createdAt: t.utaraPrep,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `Apex Build Solutions
W&H A-plas 40包
洋灰 20包`,
      lines: [line(skus, 'L-2408-1', 'emix', 40), line(skus, 'L-2408-2', 'cement', 20)],
    },
    {
      id: 'WH-2409',
      clientId: 'idaman',
      source: 'text',
      stage: 'delivered',
      salesperson: 'Boon',
      createdAt: t.delivered,
      creditFlag: false,
      creditReason: null,
      approved: false,
      rawMessage: `WallPro Renovation
红砖 15扎
洋灰 10包`,
      lines: [line(skus, 'L-2409-1', 'red-brick', 15), line(skus, 'L-2409-2', 'cement', 10)],
      invoicedAt: '2026-11-02',
      paidAt: null,
    },
    hold(
      {
        id: 'WH-2410',
        clientId: 'mega',
        source: 'pdf',
        stage: 'cancelled',
        salesperson: 'Han',
        createdAt: t.cancelled,
        creditFlag: false,
        creditReason: null,
        approved: false,
        rawMessage: `SolidMix Materials
水泥板 40片
先不要出，工地停了`,
        lines: [line(skus, 'L-2410-1', 'cem-board', 40)],
      },
      clients,
    ),
  ]

  const held = [
    ['WH-2411', 'pokok-sena-trading', 'Boon', 'cement', 300, 1850, 35],
    ['WH-2412', 'sg-petani-builders', 'Geh', 'red-brick', 150, 4200, 45],
    ['WH-2413', 'kota-setar-premier', 'Han', 'stone', 40, 9600, 55],
    ['WH-2414', 'jitra-megaprojek', 'Lye Seng', 'u-drain', 400, 18500, 65],
    ['WH-2415', 'langkawi-works', 'Boon', 'cem-board', 120, 0, 75],
    ['WH-2416', 'yan-civil', 'Jt', 'y12', 60, 7800, 90],
    ['WH-2417', 'kubang-pasu-dev', 'Boon', 'brc', 90, 9300, 100],
    ['WH-2418', 'mega', 'Geh', 'red-brick', 200, 0, 120],
  ] as const
  for (const [id, clientId, salesperson, skuId, qty, over, minutesAgo] of held) {
    orders.push(heldOrder(skus, clients, { id, clientId, salesperson, skuId, qty, over, minutesAgo }))
  }

  return [...orders, ...historyOrders(skus)]
}

function makeMessages(orders: Order[]): WaMessage[] {
  const confirmed = orders.find((order) => order.id === 'WH-2405')
  const at = confirmed?.createdAt ?? new Date().toISOString()
  const earlier = new Date(new Date(at).getTime() - 12 * 60_000).toISOString()
  const replyAt = new Date(new Date(at).getTime() + 4 * 60_000).toISOString()
  return [
    {
      id: 'msg-seed-1',
      from: 'sales',
      source: 'text',
      at: earlier,
      text: 'Morning. A few site orders coming through.',
    },
    {
      id: 'msg-seed-2',
      from: 'hq',
      source: 'text',
      at: new Date(new Date(earlier).getTime() + 60_000).toISOString(),
      text: "Morning Boon. Send them over — I'll check credit before the yard loads.",
    },
    {
      id: 'msg-seed-3',
      from: 'sales',
      source: 'text',
      at,
      orderId: 'WH-2405',
      text: confirmed?.rawMessage ?? '',
    },
    {
      id: 'msg-seed-4',
      from: 'hq',
      source: 'text',
      at: replyAt,
      orderId: 'WH-2405',
      text: 'WH-2405 is confirmed. Apex Build Solutions is inside the limit. The yard can prepare.',
    },
  ]
}

export function buildSeed(): DeskData {
  const skus = makeSkus()
  const clients = makeClients()
  const products = seedProducts(skus)
  const priceRows = seedPriceRows(skus)
  const desk = { products, priceRows }
  const orders = makeOrders(skus, clients).map((order) => {
    const placed: Order = { ...order, zone: zoneForClient(clients.find((c) => c.id === order.clientId) ?? null), deliveryMode: 'direct' }
    if (placed.stage === 'needs_approval') return { ...placed, hold: { status: 'hq' as const, escalations: 0 } }
    if (placed.stage === 'confirmed' || placed.stage === 'preparing' || placed.stage === 'delivered') {
      return withDocuments(lockOrderLines(placed, skus, desk, todayISO(new Date(placed.createdAt))), clients, skus)
    }
    return placed
  })
  const booked = clients.map((client) => ({ ...client, buckets: seedBuckets(client) }))
  return {
    version: 1,
    skus,
    clients: booked,
    orders,
    messages: makeMessages(orders),
    auditLog: [],
    products,
    priceRows,
    priceFileName: null,
    salespeople: seedSalespeople(),
    commissionAdjustments: seedAdjustments(),
    payments: seedPayments(),
    stockLog: [],
    priceSheets: seedPriceSheets(),
    priceLog: seedPriceLog(seedPriceSheets()),
    notices: [],
    ...seedInventory(skus),
  }
}
