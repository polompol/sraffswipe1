#!/usr/bin/env python3
"""Мокапы экранов Telegram Mini App StaffSwipe (молочно-золотая тема)."""
import os, random
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "mockups")
os.makedirs(OUT, exist_ok=True)
FD = "/usr/share/fonts/truetype/dejavu"
def F(s, b=False): return ImageFont.truetype(os.path.join(FD, "DejaVuSans-Bold.ttf" if b else "DejaVuSans.ttf"), s)

GOLD=(201,162,39); GOLD2=(217,164,65); CARAMEL=(176,122,71); ESP=(59,42,32)
LIKE=(201,162,39); DIS=(194,96,74); SUP=(217,164,65)
BG=(251,246,238); CARD=(255,255,255); BORDER=(236,227,214); TEXT=(46,32,24); MUTED=(138,120,102); WHITE=(255,255,255)
W,H=390,844

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def vgrad(w,h,a,b):
    im=Image.new("RGB",(w,h)); px=im.load()
    for y in range(h):
        c=lerp(a,b,y/max(1,h-1))
        for x in range(w): px[x,y]=c
    return im
def rr(d,box,r,fill=None,outline=None,width=1): d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)
def T(d,xy,s,f,fill=TEXT,a="la"): d.text(xy,s,font=f,fill=fill,anchor=a)
def pill(d,x,y,s,f,fg,bg,pad=11,h=None):
    w=d.textlength(s,font=f); ph=h or (f.size+10); rr(d,[x,y,x+w+pad*2,y+ph],ph/2,fill=bg); T(d,(x+pad,y+ph/2),s,f,fg,"lm"); return w+pad*2
def pr(base,im,x,y,r):
    m=Image.new("L",im.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,im.size[0],im.size[1]],radius=r,fill=255); base.paste(im,(x,y),m)
def screen(bg=BG):
    im=Image.new("RGB",(W,H),bg); d=ImageDraw.Draw(im); T(d,(20,16),"9:41",F(13,True),TEXT); d.text((W-20,16),"📶 ▮",font=F(12),fill=TEXT,anchor="ra"); return im,d
def frame(im):
    b=14; out=Image.new("RGB",(W+b*2,H+b*2),(28,20,15)); m=Image.new("L",im.size,0)
    ImageDraw.Draw(m).rounded_rectangle([0,0,W,H],radius=38,fill=255)
    ImageDraw.Draw(out).rounded_rectangle([2,2,W+b*2-2,H+b*2-2],radius=50,outline=(70,52,38),width=2); out.paste(im,(b,b),m); return out
def brand(d,x,y,sz=22): T(d,(x,y),"Staff",F(sz,True),TEXT,"lm"); w=d.textlength("Staff",font=F(sz,True)); T(d,(x+w,y),"Swipe",F(sz,True),GOLD,"lm")

# 1. FEED
def feed():
    im,d=screen(); brand(d,20,52); T(d,(W-24,52),"⚡",F(22),GOLD,"rm"); T(d,(20,86),"Смены рядом с вами · 3",F(12),MUTED)
    x0,y0,x1,y1=16,106,W-16,632
    ph=vgrad(x1-x0,y1-y0,(120,86,58),(48,33,23)); g=Image.new("RGBA",(x1-x0,y1-y0),(0,0,0,0)); gp=g.load()
    for yy in range(y1-y0):
        t=max(0,(yy/(y1-y0)-0.4)/0.6); a=int(235*t)
        for xx in range(x1-x0): gp[xx,yy]=(35,24,17,a)
    ph=Image.alpha_composite(ph.convert("RGBA"),g).convert("RGB"); pr(im,ph,x0,y0,24); d=ImageDraw.Draw(im); rr(d,[x0,y0,x1,y1],24,outline=BORDER,width=1)
    pill(d,x0+14,y0+14,"💰 350 ₽/час",F(13,True),WHITE,(40,28,20))
    pill(d,x1-92,y0+14,"🔥 ТОП",F(12,True),WHITE,(201,162,39))
    rot=Image.new("RGBA",(176,68),(0,0,0,0)); rd=ImageDraw.Draw(rot); rd.rounded_rectangle([2,2,174,66],radius=12,outline=GOLD,width=5); rd.text((88,34),"ХОЧУ",font=F(32,True),fill=GOLD,anchor="mm"); rot=rot.rotate(15,expand=True); im.paste(rot,(x0+22,y0+86),rot); d=ImageDraw.Draw(im)
    by=y1-176; xx=pill(d,x0+20,by,"Бариста",F(13,True),WHITE,GOLD); pill(d,x0+20+xx+8,by,"✓ Проверен",F(12,True),(190,214,255),(40,60,100))
    T(d,(x0+20,by+40),"Кофейня «Дрова»",F(25,True),WHITE); T(d,(x0+20,by+78),"16 июня · 08:00–16:00",F(13),(232,222,206)); T(d,(x0+20,by+100),"📍 ул. Льва Толстого, 16",F(13),(232,222,206))
    T(d,(x0+20,by+124),"Нужен бариста на утро. Напитки и обеды бесплатно.",F(12),(244,238,228))
    pill(d,x0+20,by+148,"⚕ Медкнижка",F(11,True),WHITE,(150,104,40)); pill(d,x0+150,by+148,"≈ 2800 ₽",F(11,True),WHITE,(120,96,40))
    ay=H-86
    def c(cx,r,col,g_,gs):
        d.ellipse([cx-r,ay-r,cx+r,ay+r],fill=CARD,outline=col,width=2); T(d,(cx,ay),g_,F(gs,True),col,"mm")
    c(118,30,DIS,"✕",30); c(195,24,SUP,"⚡",24); c(272,30,LIKE,"♥",30)
    # tabbar
    d.line([0,H-58,W,H-58],fill=BORDER)
    for i,(ic,lb,act) in enumerate([("🃏","Лента",1),("🔥","Мэтчи",0),("📅","Смены",0),("👤","Профиль",0)]):
        cx=W/8+i*W/4; T(d,(cx,H-40),ic,F(17),GOLD if act else MUTED,"mm"); T(d,(cx,H-20),lb,F(10),GOLD if act else MUTED,"mm")
    return im

# 2. MATCH
def match():
    bg=(32,22,15); im=Image.new("RGB",(W,H),bg); d=ImageDraw.Draw(im); random.seed(3)
    cols=[GOLD,GOLD2,CARAMEL,DIS,(120,150,210)]
    for i in range(46):
        x=random.randint(8,W-8); y=random.randint(30,520); s=random.randint(5,10); d.rounded_rectangle([x,y,x+s,y+s],radius=2,fill=cols[i%5])
    T(d,(W/2,250),"Это мэтч!",F(44,True),GOLD,"mm"); T(d,(W/2,322),"🤝",F(66),WHITE,"mm")
    T(d,(W/2,378),"Вы и «Кофейня «Дрова»» понравились",F(14),(225,210,190),"mm"); T(d,(W/2,398),"друг другу",F(14),(225,210,190),"mm")
    rr(d,[40,470,W-40,524],12,fill=GOLD); T(d,(W/2,497),"💬 Перейти в чат",F(16,True),WHITE,"mm")
    rr(d,[40,536,W-40,588],12,outline=(120,100,80),width=1); T(d,(W/2,562),"Продолжить листать",F(15),(210,196,176),"mm")
    return im

# 3. PRICING (деньги)
def pricing():
    im,d=screen(); T(d,(20,52),"Тарифы и буст",F(24,True),TEXT); T(d,(20,86),"Подписки — ЮKassa. Boost и супер-лайки — Stars.",F(12),MUTED)
    y=118
    def row(title,sub,cta,badge=None):
        nonlocal y; rr(d,[16,y,W-16,y+74],16,fill=CARD,outline=BORDER)
        T(d,(30,y+18),title,F(15,True),TEXT)
        if badge: pill(d,30+d.textlength(title,font=F(15,True))+10,y+14,badge,F(10,True),GOLD,(247,240,225))
        T(d,(30,y+44),sub,F(11.5),MUTED)
        bw=d.textlength(cta,font=F(14,True))+28; rr(d,[W-30-bw,y+20,W-30,y+54],10,fill=GOLD); T(d,(W-30-bw/2,y+37),cta,F(14,True),WHITE,"mm")
        y+=86
    T(d,(20,y-6),"Подписки для работодателей",F(13,True),CARAMEL); y+=18
    row("Pro · неделя","Безлимит вакансий, фильтры, 3 boost","690 ₽")
    row("Pro · месяц","+10 boost, аналитика","1990 ₽","Хит")
    row("Business","Несколько точек, приоритет, 30 boost","4990 ₽")
    T(d,(20,y-2),"Boost и супер-лайки",F(13,True),CARAMEL); y+=22
    row("🔥 Boost 24 часа","Вакансия в топе ленты сутки","150 ★")
    row("⚡ 20 супер-лайков","Ваш отклик — первым","300 ★","−25%")
    return im

# 4. PROFILE
def profile():
    im,d=screen(); T(d,(20,52),"Профиль",F(24,True),TEXT); T(d,(W-24,54),"Выйти",F(13),MUTED,"rm")
    rr(d,[16,92,W-16,168],16,fill=CARD,outline=BORDER); T(d,(40,130),"🙂",F(40),TEXT,"mm")
    T(d,(76,116),"Алексей",F(19,True),TEXT); T(d,(76,142),"24 года · Москва, Хамовники",F(12),MUTED)
    rr(d,[16,184,W-16,272],16,fill=CARD,outline=BORDER); T(d,(30,202),"Тариф: Free",F(15,True),TEXT)
    bw=d.textlength("Улучшить",font=F(13,True))+24; rr(d,[W-30-bw,200,W-30,232],9,outline=GOLD,width=1); T(d,(W-30-bw/2,216),"Улучшить",F(13,True),GOLD,"mm")
    T(d,(30,244),"⚡ Супер-лайки: 1   🔥 Boost: 0",F(13),MUTED)
    # Реферальный блок
    rr(d,[16,288,W-16,392],16,fill=CARD,outline=BORDER)
    T(d,(30,306),"Пригласить друзей",F(15,True),TEXT)
    T(d,(30,330),"За каждого по ссылке — 3 супер-лайка.",F(11.5),MUTED)
    T(d,(30,348),"Уже пришло: 2",F(11.5),MUTED)
    rr(d,[30,364,W-30,392],8,fill=GOLD); T(d,(W/2,378),"🎁 Поделиться приглашением",F(13,True),WHITE,"mm")
    rr(d,[16,406,W-16,452],12,outline=BORDER,width=1); T(d,(W/2,429),"✏️ Редактировать профиль",F(14,True),TEXT,"mm")
    d.line([0,H-58,W,H-58],fill=BORDER)
    for i,(ic,lb,act) in enumerate([("🃏","Лента",0),("🔥","Мэтчи",0),("📅","Смены",0),("👤","Профиль",1)]):
        cx=W/8+i*W/4; T(d,(cx,H-40),ic,F(17),GOLD if act else MUTED,"mm"); T(d,(cx,H-20),lb,F(10),GOLD if act else MUTED,"mm")
    return im

# ---------- 5. FUNNEL (дашборд аналитики) ----------
def funnel():
    im,d=screen(); T(d,(20,52),"Воронка",F(24,True),TEXT)
    T(d,(20,86),"Путь: открытие → свайп → мэтч → смена → покупка",F(11.5),MUTED)
    rows=[("Открыли",1200,1.0,None),("Свайпнули",940,0.78,"78%"),
          ("Мэтч",410,0.34,"44%"),("Подтвердили смену",180,0.15,"44%"),
          ("Покупка",64,0.05,"36%")]
    y=120
    for label,val,frac,conv in rows:
        rr(d,[16,y,W-16,y+78],16,fill=CARD,outline=BORDER)
        T(d,(30,y+16),label,F(14,True),TEXT)
        T(d,(W-30,y+16),f"{val:,}".replace(","," "),F(14,True),TEXT,"ra")
        rr(d,[30,y+44,W-30,y+56],6,fill=BORDER)
        rr(d,[30,y+44,30+int((W-60)*frac),y+56],6,fill=GOLD)
        if conv: T(d,(30,y+64),f"конверсия: {conv}",F(11),MUTED)
        y+=88
    return im

scr=[("tma_feed",feed),("tma_match",match),("tma_pricing",pricing),
     ("tma_funnel",funnel),("tma_profile",profile)]
ims=[]
for n,fn in scr:
    im=frame(fn()); im.save(os.path.join(OUT,f"{n}.png")); ims.append(im); print("saved",n)
cw,ch=ims[0].size; pad=22; cols=len(ims)
sheet=Image.new("RGB",(cols*cw+pad*(cols+1),ch+pad*2),(244,238,228))
for i,im in enumerate(ims): sheet.paste(im,(pad+i*(cw+pad),pad))
sheet.save(os.path.join(OUT,"tma_overview.png")); print("saved tma_overview",sheet.size)
