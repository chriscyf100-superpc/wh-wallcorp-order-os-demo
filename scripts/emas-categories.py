# Sorts the EMAS item code listing into groups / categories / brands. Input: items.json parsed from
# ~/Downloads/price list.pdf (code, d1, unit, a, d2). Usage: python3 emas-categories.py items.json src/data/emas-items.json

import json, re, sys, collections
it = json.load(open(sys.argv[1]))

GROUPS = [
 ('Roofing', ['Monier roof tiles','Lama roof tiles','Clay roof tiles','Other concrete roof tiles','Metal roofing sheets','Polycarbonate & fibre roof sheets','Trusses, battens & purlins','Roof insulation & foil','Roof accessories']),
 ('Bricks & blocks', ['Clay common bricks','Sand bricks','Facing bricks & veneers','Lightweight (AAC) blocks','Concrete & CMU blocks','Ventilation & breeze blocks','Stone cladding']),
 ('Paving & landscape', ['Pavers','Grass pavers','Kerbs','Copings & half rounds','Floor & outdoor tiles']),
 ('Cement, mortar & render', ['Cement','Skim coat, render & plaster','Tile adhesive & grout','Ready-mix concrete']),
 ('Waterproofing & chemicals', ['Waterproofing','Admixtures, primers & sealants','Repair, screed & floor']),
 ('Steel', ['Rebar','BRC & wire mesh','Wire & nails']),
 ('Concrete & drainage', ['RC pipes','Clay (VCP) pipes & fittings','U-drains & box culverts','Manholes & covers','Concrete poles & fencing','Precast & piles']),
 ('Doors & windows', ['Doors','Door frames','Window frames & louvres','Aluminium windows & panels','Door & window fittings']),
 ('Boards & timber', ['Fibre cement boards','Plywood']),
 ('Plumbing & sanitary', ['Water tanks','Septic & subsoil','Sanitary ware']),
 ('Sundries', ['Plastic sheets & film','Tools','Other']),
 ('Charges & specials', ['Charges, rentals & credit notes','Special items']),
]
CATS = [c for _, cs in GROUPS for c in cs]
GROUP_OF = {c: g for g, cs in GROUPS for c in cs}

# (code regex, name regex, category) — first match wins. Name-led so mislabelled prefixes are corrected.
R = [
 (r'^(A01|B01|CN|DN|D01|90)-', None, 'Charges, rentals & credit notes'),
 (None, r'^SPECIAL ITEM$', 'Special items'),
 (None, r'LUBRICANT|STEAM COAL|DIESEL|EXPENSES|CAT 0\.5 LITTER', 'Other'),
 (None, r'TROWEL|STIRRER|SPONGE|MORTAR PUMP BAG|SAW\b|RASP|SANDING|^NOTCHED', 'Tools'),
 (None, r'STRETCH FILM|PE SHEET|PLASTIC SHEET|^BLUE \(|FLOORGARD|NETTING', 'Plastic sheets & film'),
 # roofing
 (r'^41-', r'^(EASY FLASH|RIDGE TREE|RUBBER VENTILATOR)|PEST GUARD', 'Roof accessories'),
 (r'^41-', None, 'Monier roof tiles'),
 (r'^42-(29|30)', None, 'Door frames'),
 (r'^42-10', None, 'Roof accessories'),
 (r'^42-', None, 'Lama roof tiles'),
 (r'^(39|40|82)-', None, 'Clay roof tiles'),
 (r'^(43|46)-|^44-01|^47-01', None, 'Other concrete roof tiles'),
 (None, r'SUN-?FOIL|WOVEN FOIL|ALU WOVEN|ALU.?BUBBLE|MPET|TOPWOOL|ROCKWOOL', 'Roof insulation & foil'),
 (None, r'^SCREW', 'Roof accessories'),
 (None, r'T-SHIRT|UMBRELLA', 'Other'),
 (None, r'DRAIN COVER|MILD STEEL FRAME', 'Manholes & covers'),
 (None, r'\bWC|BASIN|SQUATTING|CLOST', 'Sanitary ware'),
 (None, r'FLESEAL|BITUFLEX|EASYCOAT WP|IDROSTOP|WATER STOP|MAPEFER|PENTENS T-?[13]0', 'Waterproofing'),
 (None, r'LINTEL', 'Precast & piles'),
 (None, r'^WINDOW FRAME|^FRAME C/W PIPE', 'Window frames & louvres'),
 (None, r'^FO-M', 'Floor & outdoor tiles'),
 (None, r'SANDBLST|BARKFACE', 'Facing bricks & veneers'),
 (None, r'HOLLOW BLOCK|CELLULAR', 'Concrete & CMU blocks'),
 (None, r'STONE SEALER', 'Admixtures, primers & sealants'),
 (None, r'SPLAYED|CHANNEL KERB', 'Kerbs'),
 (None, r'CLOST', 'Sanitary ware'),
 (None, r'BATTEN|C[ .-]?SECTION|PURLIN|TRUSS|L BRACKET 1\.6', 'Trusses, battens & purlins'),
 (None, r'SUNDEX|SUNROOF', 'Polycarbonate & fibre roof sheets'),
 (r'^52-3[45]', None, 'Polycarbonate & fibre roof sheets'),
 (None, r'T\.C\.T|ROOFING|PU METAL|AP RIB|V CAPPING', 'Metal roofing sheets'),
 (None, r'SEALFIX|TOPLIGHT|BITUMIN FELT|WEATHER SEAL|BIRD COMB', 'Roof accessories'),
 # cement & render
 (r'^63-', None, 'Cement'),
 (r'^64-', None, 'Ready-mix concrete'),
 (None, r'SKIM|QUICKPLAST|RENDER|PLASTER|STARKEN (FINISH|BASE|ONE)|EMIX (BASED|FINISH)|YTL (BASE|FINISH|SKIM)|THIN BED|THIN MORTAR|JOINT MORTAR|KAPUR', 'Skim coat, render & plaster'),
 (None, r'GROUT|GROUNT|KERACOLOR|ULTRACOLOR|FUGA FRESCA|KERAPOXY|ADHESIVE|KERABOND|KERAFLEX|ADESILEX|KERASET|WEBERSET|READYFIX|SUPERFLEX 21|EASY-FIX|EASYFLEX|X.TRA FLEX|SUPER GLUE|KERAFLOOR', 'Tile adhesive & grout'),
 (None, r'WATERPROOF(?!.*PLYWOOD)|WEBERDRY|AQUAFLEX|PLANISEAL|IDROSILEX|ISOLASTIC|MAPELASTIC|MAPEBAND|MAPETHENE|AQUADEFENSE|IGLOFLEX|ANTIPLUVIOL|FLEXI COAT|SIKA', 'Waterproofing'),
 (None, r'SCREED|NOVOPLAN|MAPEFLOOR|WEBERFLOOR|MAPEGROUNT|PATCH|MONOTOP|MAPEFILL|MAPETOP|NSG 12|EPORIP|LAMPOSILEX|FASTCEMENT|MAPEI B10', 'Repair, screed & floor'),
 (r'^(72|73|79|83|84)-', None, 'Admixtures, primers & sealants'),
 # steel
 (r'^53-70', None, 'Charges, rentals & credit notes'),
 (r'^53-(A|B)|^95-02', None, 'BRC & wire mesh'),
 (r'^53-', None, 'Rebar'),
 (r'^(74|86)-', None, 'Wire & nails'),
 # drainage & precast
 (r'^6[12]-', r'BARRIER', 'Precast & piles'),
 (r'^6[12]-', r'U-SHAPE|U DRAIN', 'U-drains & box culverts'),
 (r'^6[12]-', None, 'RC pipes'),
 (r'^60-', None, 'Clay (VCP) pipes & fittings'),
 (r'^99-0[89]', None, 'Precast & piles'),
 (r'^99-', None, 'U-drains & box culverts'),
 (None, r'MAN-?HOLE|GULLY|SC (COVER|FRAME)', 'Manholes & covers'),
 (None, r'POLE', 'Concrete poles & fencing'),
 (None, r'HALF ROUND|COPING|COPPING', 'Copings & half rounds'),
 (None, r'KERB', 'Kerbs'),
 (None, r'V SHAPE DRAIN|SPUN PIPE|CONCRETE SLAB|RC PILE', 'Precast & piles'),
 # paving
 (None, r'GRASS|TURF PAVE|ECO ARCH', 'Grass pavers'),
 (None, r'EUROTILE|^FL-M|VISUALLY IMPAIRED|SUKABUMI|ELIZABETH|E WALK|PEBBLE SERIES', 'Floor & outdoor tiles'),
 (None, r'PAVE|PAVER|GEOMETRIC|HEXALOCK|TRAFIKA|DESERT|M SERIES|CARPET BLOCK|HOLLAND|COBBLE|EZYPAVE|NEUPAVE', 'Pavers'),
 # bricks & blocks
 (r'^1[0-2]-', None, 'Clay common bricks'),
 (r'^17-', None, 'Sand bricks'),
 (None, r'LIGHT ?WEIGHT BLOCK|HY BRICK', 'Lightweight (AAC) blocks'),
 (None, r'VENTILATION BLOCK|BREEZE|AIRWAY', 'Ventilation & breeze blocks'),
 (None, r'LEDGESTONE|CASTLE STONE|STACKED STONE', 'Stone cladding'),
 (None, r'FACING BRICK|ROCK FACE (BRICK|215)|VEENER|VENEER|SANDBLAST|WIRECUT|BULLNOSE|S-BRICK|SHADED DARK|^MB[RS]F', 'Facing bricks & veneers'),
 (None, r'CMU|SPLIT FACE|BLOCK 140|FULL BLOCK|HALF BLOCK|BOND BEAM', 'Concrete & CMU blocks'),
 # doors & windows
 (None, r'HANDLE|LATCH|CLIP|BRACKET|EXON FAN', 'Door & window fittings'),
 (None, r'DOOR FRAME|FRAME BA', 'Door frames'),
 (None, r'W/FRAME|LOUVERS|LOUVRE|BLADES|NACO|NAKO|NACHO', 'Window frames & louvres'),
 (r'^32-', None, 'Aluminium windows & panels'),
 (None, r'DOOR|PANEL 0|FLUTED', 'Doors'),
 (r'^3[5-8]-|^75-|^89-', None, 'Doors'),
 # boards
 (r'^76-', None, 'Plywood'),
 (None, r'PLYWOOD', 'Plywood'),
 (r'^52-', None, 'Fibre cement boards'),
 # plumbing
 (r'^6[8]-|^77-01', None, 'Water tanks'),
 (r'^67-', None, 'Septic & subsoil'),
 (None, r'WC|BASIN|SQUATTING|SERIATE', 'Sanitary ware'),
 (r'^45-', None, 'Precast & piles'),
 (r'^(85|87|9[1-6])-', None, 'Special items'),
]
BRANDS = [('Monier',r'MONIER|ROOF SYSTEM HORIZON'),('Lama',r'^LAMA'),('Mapei',r'MAPE|KERA|PLANI|ADESILEX|IDROSILEX|ISOLASTIC|AQUAFLEX|NOVOPLAN|FUGOLASTIC|ULTRACOLOR|FASTCEMENT|LAMPOSILEX|ANTIPLUVIOL|DURESIL|ECO PRIM'),
 ('Weber',r'WEBER|BELBOND'),('Emix',r'EMIX|EASI '),('Starken',r'STARKEN'),('YTL',r'^YTL'),('Blue Lion',r'BLUE LION'),('Hume',r'^HUME'),('Lafarge',r'LAFARGE'),('Tasek',r'TASEK'),
 ('Sunway',r'SUNWAY'),('OKA',r'^OKA'),('API',r'^API'),('Ledex',r'LEDEX'),('Ajiya',r'AJIYA'),('Sika',r'SIKA'),('Prima / UAC',r'PRIMA|UAC'),('Weida',r'WEIDA'),('Gyproc',r'GYPROC'),('Shera',r'SHERA'),('Astino',r'ASTINO'),('Sundex',r'SUNDEX')]
BRAND_NAMES=[b for b,_ in BRANDS]

def classify(code, name):
    for cre, nre, cat in R:
        if cre and not re.search(cre, code): continue
        if nre and not re.search(nre, name): continue
        return cat
    return None

rows=[]; miss=collections.Counter()
for i in it:
    d=i['d1']; unit=i['unit']
    if re.search(r'\d', unit): d=d+' '+unit; unit=''
    name=re.sub(r'\s+',' ',' '.join([d]+i['d2'])).strip().replace('( ','(').replace(' )',')')
    cat=classify(i['code'], name)
    if cat is None:
        miss[i['code'].split('-')[0]]+=1; cat='Other'
    b=next((k for k,(bn,bre) in enumerate(BRANDS) if re.search(bre,name)),-1)
    rows.append([i['code'], name, unit, round(i['a'],2), CATS.index(cat), b])
out={'source':'EMAS item code listing, printed 03/11/2026 (3,768 items)','groups':[{'name':g,'categories':[CATS.index(c) for c in cs]} for g,cs in GROUPS],'categories':CATS,'brands':BRAND_NAMES,'items':rows}
json.dump(out, open(sys.argv[2],'w'), separators=(',',':'), ensure_ascii=False)
print(len(rows),'unclassified',dict(miss))
cnt=collections.Counter(r[4] for r in rows)
for k,c in enumerate(CATS): print(f'{cnt[k]:5} {GROUP_OF[c]:26} {c}')
if len(sys.argv)>3:
    want=sys.argv[3]
    for r in rows:
        if CATS[r[4]]==want: print(r[0],r[1][:70])
