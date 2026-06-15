#!/usr/bin/env python3
"""Рендер мокапов экранов StaffSwipe (молочно-шоколадно-золотая тема)."""
import os, random
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "mockups")
os.makedirs(OUT, exist_ok=True)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)
def serif(size, bold=True):
    name = "DejaVuSerif-Bold.ttf" if bold else "DejaVuSerif.ttf"
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

# ---- палитра (AppColors, светлая молочная тема) ----
PRIMARY=(201,162,39); SECONDARY=(176,122,71); GOLD=(217,164,65)
ESPRESSO=(59,42,32)
LIKE=(201,162,39); DISLIKE=(194,96,74); SUPER=(217,164,65); INFO=(138,109,75)
BG=(251,246,238); SURFACE=(255,255,255); CARD=(255,253,249); BORDER=(236,227,214)
TEXT=(46,32,24); MUTED=(138,120,102); WARN=(199,140,40)
WHITE=(255,255,255)
W,H = 390, 844

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def vgrad(w,h,top,bot):
    img=Image.new("RGB",(w,h)); px=img.load()
    for y in range(h):
        c=lerp(top,bot,y/max(1,h-1))
        for x in range(w): px[x,y]=c
    return img
def diag_grad(w,h,colors):
    img=Image.new("RGB",(w,h)); px=img.load(); n=len(colors)
    for y in range(h):
        for x in range(w):
            t=((x/w)+(y/h))/2; seg=t*(n-1); i=min(int(seg),n-2); f=seg-i
            px[x,y]=lerp(colors[i],colors[i+1],f)
    return img
def rrect(d,box,r,fill=None,outline=None,width=1):
    d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)
def text(d,xy,s,f,fill=TEXT,anchor="la"):
    d.text(xy,s,font=f,fill=fill,anchor=anchor)
def pill(d,x,y,s,f,fg,bg,pad=11,h=None):
    w=d.textlength(s,font=f); ph=h or (f.size+10)
    rrect(d,[x,y,x+w+pad*2,y+ph],ph/2,fill=bg)
    text(d,(x+pad,y+ph/2),s,f,fill=fg,anchor="lm")
    return w+pad*2
def paste_round(base,img,x,y,r):
    m=Image.new("L",img.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,img.size[0],img.size[1]],radius=r,fill=255)
    base.paste(img,(x,y),m)

def screen(bg=BG, dark=False):
    img=Image.new("RGB",(W,H),bg); d=ImageDraw.Draw(img)
    fg = WHITE if dark else TEXT
    text(d,(20,18),"9:41",font(14,True),fg)
    d.text((W-20,18),"●●● ▮",font=font(13),fill=fg,anchor="ra")
    return img,d

def frame(img):
    bez=14
    out=Image.new("RGB",(W+bez*2,H+bez*2),(28,20,15))
    m=Image.new("L",img.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,W,H],radius=38,fill=255)
    ImageDraw.Draw(out).rounded_rectangle([2,2,W+bez*2-2,H+bez*2-2],radius=50,outline=(70,52,38),width=2)
    out.paste(img,(bez,bez),m)
    return out

def brand_title(d,x,y):
    text(d,(x,y),"Staff",serif(22),TEXT,anchor="lm")
    wx=d.textlength("Staff",font=serif(22))
    text(d,(x+wx,y),"Swipe",serif(22),PRIMARY,anchor="lm")

# ---------- 1. AUTH ----------
def auth():
    img,d=screen()
    g=diag_grad(56,56,[GOLD,PRIMARY,(169,133,26)]); paste_round(img,g,24,70,18)
    d=ImageDraw.Draw(img)
    text(d,(52,98),"S",serif(30),WHITE,anchor="mm")
    text(d,(92,98),"StaffSwipe",serif(30),TEXT,anchor="lm")
    text(d,(24,168),"Вход по телефону",serif(27),TEXT)
    text(d,(24,206),"Отправим SMS с кодом подтверждения",font(13),MUTED)
    rrect(d,[24,240,W-24,294],14,fill=SURFACE,outline=BORDER)
    text(d,(44,267),"+7 999 123-45-67",font(20,True),TEXT,anchor="lm")
    rrect(d,[24,308,W-24,362],14,fill=PRIMARY)
    text(d,(W/2,335),"Получить код",font(16,True),WHITE,anchor="mm")
    text(d,(W/2,392),"—  или войти через  —",font(12),MUTED,anchor="mm")
    rrect(d,[24,414,189,464],14,outline=BORDER,width=1); text(d,(106,439),"VK ID",font(15,True),(0,119,255),anchor="mm")
    rrect(d,[201,414,W-24,464],14,outline=BORDER,width=1); text(d,(295,439),"Telegram",font(15,True),(34,158,217),anchor="mm")
    text(d,(W/2,H-70),"Сервис только для 18+. Нажимая «Получить код»,",font(11),MUTED,anchor="mm")
    text(d,(W/2,H-52),"вы соглашаетесь с условиями сервиса.",font(11),MUTED,anchor="mm")
    return img

# ---------- 2. ROLE ----------
def role_card(img,y,title,sub,grad,letter):
    d=ImageDraw.Draw(img)
    rrect(d,[16,y,W-16,y+92],18,fill=CARD,outline=BORDER)
    g=diag_grad(56,56,grad); paste_round(img,g,36,y+18,16)
    d=ImageDraw.Draw(img)
    text(d,(64,y+46),letter,serif(24),WHITE,anchor="mm")
    text(d,(108,y+30),title,font(16,True),TEXT)
    text(d,(108,y+56),sub,font(12),MUTED)
    text(d,(W-34,y+46),"›",font(28),MUTED,anchor="mm")
def role():
    img,d=screen()
    text(d,(24,80),"Кто вы?",serif(27),TEXT)
    text(d,(24,116),"Это можно будет поменять позже",font(13),MUTED)
    role_card(img,150,"Я ищу подработку","Официант, бариста, повар, бармен, хостес",[GOLD,SECONDARY],"С")
    role_card(img,258,"Я ищу сотрудников","Кафе, ресторан, бар, кофейня",[SECONDARY,ESPRESSO],"Р")
    return img

# ---------- 3. FEED ----------
def feed():
    img,d=screen()
    brand_title(d,20,54)
    text(d,(W-24,54),"≡",font(24,True),TEXT,anchor="rm")
    text(d,(20,88),"Смены рядом с вами · 4",font(12),MUTED)
    cx0,cy0,cx1,cy1=16,108,W-16,628
    photo=vgrad(cx1-cx0,cy1-cy0,(120,86,58),(58,40,28))
    pd=ImageDraw.Draw(photo)
    pd.ellipse([60,40,200,180],fill=(150,112,76)); pd.ellipse([180,120,300,260],fill=(132,96,64))
    grad=Image.new("RGBA",(cx1-cx0,cy1-cy0),(0,0,0,0)); gp=grad.load()
    for yy in range(cy1-cy0):
        t=max(0,(yy/(cy1-cy0)-0.42)/0.58); a=int(232*max(0,t))
        for xx in range(cx1-cx0): gp[xx,yy]=(40,28,20,a)
    photo=Image.alpha_composite(photo.convert("RGBA"),grad).convert("RGB")
    paste_round(img,photo,cx0,cy0,24)
    d=ImageDraw.Draw(img)
    rrect(d,[cx0,cy0,cx1,cy1],24,outline=BORDER,width=1)
    pill(d,cx0+14,cy0+14,"350 ₽/час",font(14,True),WHITE,(40,28,20))
    s="1.6 км"; w=d.textlength(s,font=font(13,True))
    pill(d,cx1-14-(w+22),cy0+14,s,font(13,True),WHITE,(40,28,20))
    rot=Image.new("RGBA",(180,72),(0,0,0,0)); rd=ImageDraw.Draw(rot)
    rd.rounded_rectangle([2,2,178,70],radius=12,outline=GOLD,width=5)
    rd.text((90,36),"ХОЧУ",font=serif(34),fill=GOLD,anchor="mm")
    rot=rot.rotate(16,expand=True); img.paste(rot,(cx0+22,cy0+30),rot)
    d=ImageDraw.Draw(img)
    by=cy1-188
    x=pill(d,cx0+20,by,"Бариста",font(13,True),WHITE,PRIMARY)
    pill(d,cx0+20+x+8,by,"✓ Проверен",font(12,True),WHITE,(70,52,34))
    text(d,(cx0+20,by+42),"Кофейня «Дрова»",serif(27),WHITE)
    text(d,(cx0+20,by+82),"завтра · 08:00–16:00",font(13),(232,222,206))
    text(d,(cx0+20,by+104),"ул. Льва Толстого, 16",font(13),(232,222,206))
    text(d,(cx0+20,by+128),"Нужен бариста на утро. Напитки и обеды бесплатно.",font(12),(244,238,228))
    pill(d,cx0+20,by+152,"Медкнижка",font(11,True),WHITE,(150,104,40))
    pill(d,cx0+140,by+152,"≈ 2800 ₽/смена",font(11,True),WHITE,(120,96,40))
    ay=H-94
    def circ(cx,r,color,glyph,gs,filled=False):
        if filled:
            d.ellipse([cx-r,ay-r,cx+r,ay+r],fill=color)
            text(d,(cx,ay),glyph,font(gs,True),WHITE,anchor="mm")
        else:
            d.ellipse([cx-r,ay-r,cx+r,ay+r],fill=SURFACE,outline=color,width=2)
            text(d,(cx,ay),glyph,font(gs,True),color,anchor="mm")
    circ(64,22,SECONDARY,"↺",24); circ(138,30,DISLIKE,"✕",30)
    circ(210,26,SUPER,"⚡",26); circ(292,30,PRIMARY,"♥",30,filled=True)
    return img

# ---------- 4. MATCH ----------
def match():
    bg=(30,21,15); img=Image.new("RGB",(W,H),bg); d=ImageDraw.Draw(img)
    # мягкое золотое свечение
    glow=Image.new("RGB",(W,H),bg); gp=glow.load()
    cx,cy=W/2,300
    for y in range(H):
        for x in range(0,W,1):
            dist=((x-cx)**2+(y-cy)**2)**0.5
            t=max(0,1-dist/300)*0.5
            gp[x,y]=lerp(bg,GOLD,t)
    img=glow; d=ImageDraw.Draw(img)
    random.seed(3)
    for i in range(16):
        x=random.randint(30,W-30); y=random.randint(80,520); s=random.randint(3,6)
        d.ellipse([x,y,x+s,y+s],fill=GOLD)
    text(d,(W/2,210),"Это мэтч",serif(46),GOLD,anchor="mm")
    text(d,(W/2,262),"Вы и «Кофейня «Дрова»» подходите",font(14),(233,223,207),anchor="mm")
    text(d,(W/2,282),"друг другу",font(14),(233,223,207),anchor="mm")
    a1=diag_grad(116,116,[(150,112,76),(80,56,38)]); paste_round(img,a1,W//2-104,330,20)
    a2=diag_grad(116,116,[(120,86,58),(60,42,28)]); paste_round(img,a2,W//2-12,330,20)
    d=ImageDraw.Draw(img)
    d.rounded_rectangle([W//2-104,330,W//2+12,446],radius=20,outline=GOLD,width=2)
    d.rounded_rectangle([W//2-12,330,W//2+104,446],radius=20,outline=GOLD,width=2)
    d.ellipse([W//2-22,366,W//2+22,410],fill=PRIMARY,outline=bg,width=3)
    text(d,(W/2,388),"♥",font(20,True),WHITE,anchor="mm")
    rrect(d,[40,560,W-40,614],14,fill=PRIMARY); text(d,(W/2,587),"Перейти в чат",font(16,True),WHITE,anchor="mm")
    text(d,(W/2,646),"Продолжить листать",font(14),(179,161,140),anchor="mm")
    return img

# ---------- 5. CHAT ----------
def bubble(d,img,y,s,mine,maxw=250):
    f=font(14); lines=[]; cur=""
    for word in s.split():
        if d.textlength(cur+" "+word,font=f)<maxw-28: cur=(cur+" "+word).strip()
        else: lines.append(cur); cur=word
    lines.append(cur)
    tw=max(d.textlength(l,font=f) for l in lines); bw=tw+28; bh=len(lines)*20+18
    bx=W-16-bw if mine else 16
    col=PRIMARY if mine else CARD
    d.rounded_rectangle([bx,y,bx+bw,y+bh],radius=16,fill=col,outline=None if mine else BORDER)
    for i,l in enumerate(lines):
        text(d,(bx+14,y+10+i*20),l,f,WHITE if mine else TEXT)
    return y+bh+10
def chat():
    img,d=screen()
    ph=diag_grad(38,38,[(150,112,76),(80,56,38)]); paste_round(img,ph,52,44,10)
    d=ImageDraw.Draw(img)
    text(d,(20,60),"‹",font(28,True),TEXT,anchor="lm")
    text(d,(100,52),"Кофейня «Дрова»",font(16,True),TEXT)
    d.ellipse([100,72,107,79],fill=LIKE); text(d,(114,75),"онлайн",font(12),MUTED,anchor="lm")
    rrect(d,[16,96,W-16,150],14,fill=(247,238,224),outline=(225,205,160))
    text(d,(34,108),"Бариста · 350 ₽/час",font(15,True),TEXT)
    text(d,(34,130),"завтра · 08:00–16:00",font(12),MUTED)
    pill(d,W-118,112,"Мэтч",font(11,True),WHITE,PRIMARY)
    y=168
    d.rounded_rectangle([56,y,W-56,y+44],radius=12,fill=SURFACE,outline=BORDER)
    text(d,(W/2,y+22),"Это мэтч! Смена «Бариста» 16 июн.",font(11),MUTED,anchor="mm")
    y+=58
    y=bubble(d,img,y,"Здравствуйте! Готовы выйти на смену? Какие вопросы?",False)
    y=bubble(d,img,y,"Да, всё отлично. Во сколько подойти?",True)
    y=bubble(d,img,y,"К 7:45, форму выдадим на месте",False)
    rrect(d,[16,H-150,W-16,H-110],12,outline=LIKE,width=2)
    text(d,(W/2,H-130),"Подтвердить смену",font(15,True),LIKE,anchor="mm")
    rrect(d,[16,H-96,W-78,H-52],14,fill=SURFACE,outline=BORDER)
    text(d,(32,H-74),"Сообщение…",font(14),MUTED,anchor="lm")
    d.ellipse([W-68,H-96,W-24,H-52],fill=PRIMARY); text(d,(W-46,H-74),"→",font(20,True),WHITE,anchor="mm")
    return img

# ---------- 6. SHIFTS ----------
def shifts():
    img,d=screen()
    text(d,(20,58),"Мои смены",serif(24),TEXT)
    rrect(d,[16,98,W-16,302],18,fill=CARD,outline=BORDER)
    text(d,(32,114),"Кофейня «Дрова»",font(16,True),TEXT)
    pill(d,W-168,112,"Смена подтверждена",font(10,True),WHITE,LIKE)
    rows=["Бариста","16 июня, понедельник","08:00–16:00","≈ 2800 ₽"]
    yy=150
    for tx in rows:
        d.ellipse([32,yy-3,38,yy+3],fill=PRIMARY); text(d,(50,yy),tx,font(15),TEXT,anchor="lm"); yy+=30
    rrect(d,[32,268,W-32,306],12,outline=PRIMARY,width=2)
    text(d,(W/2,287),"Сформировать акт (PDF)",font(14,True),PRIMARY,anchor="mm")
    rrect(d,[16,322,W-16,394],18,fill=CARD,outline=BORDER)
    text(d,(32,340),"Бар «Полночь»",font(16,True),TEXT)
    pill(d,W-130,338,"Завершено",font(10,True),WHITE,MUTED)
    text(d,(32,368),"Бармен · 18 июня · ≈ 4500 ₽",font(13),MUTED)
    d.line([0,H-66,W,H-66],fill=BORDER)
    labels=[("▣","Лента",MUTED),("♥","Мэтчи",MUTED),("▦","Смены",PRIMARY),("◔","Профиль",MUTED)]
    for i,(ic,lb,col) in enumerate(labels):
        cx=W/8+i*W/4
        text(d,(cx,H-46),ic,font(18,True),col,anchor="mm"); text(d,(cx,H-24),lb,font(10),col,anchor="mm")
    return img

screens=[("1_auth",auth),("2_role",role),("3_feed",feed),("4_match",match),("5_chat",chat),("6_shifts",shifts)]
imgs=[]
for name,fn in screens:
    im=frame(fn()); im.save(os.path.join(OUT,f"{name}.png")); imgs.append(im); print("saved",name)
pad=24; cols=3; rows=2; cw,ch=imgs[0].size
sheet=Image.new("RGB",(cols*cw+pad*(cols+1),rows*ch+pad*(rows+1)),(243,235,224))
for i,im in enumerate(imgs):
    r,c=divmod(i,cols); sheet.paste(im,(pad+c*(cw+pad),pad+r*(ch+pad)))
sheet.save(os.path.join(OUT,"overview.png")); print("saved overview", sheet.size)
