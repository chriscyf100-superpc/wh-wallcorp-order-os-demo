import type { Source } from './types.ts'

export interface Sample {
  id: string
  label: string
  hint: string
  source: Source
  text: string
}

export const SAMPLES: Sample[] = [
  {
    id: 'utara',
    label: '1 · Apex clean',
    hint: 'Credit is clear. Brick at 22 is Price C.',
    source: 'text',
    text: `老板，Apex Build Solutions 要货：
红砖 22扎
洋灰 40包
esok pagi hantar Subang
— Boon`,
  },
  {
    id: 'hardware',
    label: '2 · Buildmate credit',
    hint: 'This note pushes them over the RM 20,000 limit.',
    source: 'text',
    text: `Buildmate Supplies
OKA管 12条
U-drain 10条
W&H A-plas 20包
boss, customer cakap urgent, petang ni boleh hantar?`,
  },
  {
    id: 'stock',
    label: '3 · Steel 没货',
    hint: 'Y12 is out. River sand is low.',
    source: 'text',
    text: `Apex Build Solutions
铁枝 Y12 8扎
河沙 2车
site foreman cakap besi kena hari ni`,
  },
  {
    id: 'kedah',
    label: '4 · Metro Crest 60 days',
    hint: 'Inside the limit, but 60 days overdue.',
    source: 'text',
    text: `Metro Crest Construction 账还挂着，工地催货:
水泥板 16片
红砖 20扎
tolong arrange lorry esok pagi`,
  },
  {
    id: 'idaman',
    label: '5 · WallPro 30 days',
    hint: '30 days on the book, still inside the limit.',
    source: 'text',
    text: `WallPro Renovation
地砖 18扎
洋灰 10包
hantar USJ, petang`,
  },
  {
    id: 'payment',
    label: '4 · Cheque received',
    hint: 'A payment note, not an order. HQ confirms it in Payments in; the held WH-2404 can then go.',
    source: 'text',
    text: `Boss, Metro Crest Construction bayar cheque RM 12,000 hari ni, MBB 228761.
Dia tanya order semalam boleh hantar?`,
  },
  {
    id: 'price',
    label: '5 · Price check',
    hint: 'A price question, not an order. The desk answers with the latest published ladder for that town.',
    source: 'text',
    text: `Boss harga W&H A-plas hantar Shah Alam berapa? Customer ambil 200 bags`,
  },
]
