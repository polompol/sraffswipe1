#!/usr/bin/env python3
"""Рендер мокапов экранов StaffSwipe (цвета берём из AppColors/AppTheme)."""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "mockups")
os.makedirs(OUT, exist_ok=True)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
def font(size, bold=False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

# ---- палитра (AppColors) ----
PRIMARY=(255,90,31); SECONDARY=(255,45,85); AMBER=(255,176,32)
LIKE=(34,197,94); DISLIKE=(244,63,94); SUPER=(59,130,246); INFO=(59,130,246)
BG=(11,11,15); SURFACE=(20,20,24); CARD=(24,24,29); BORDER=(38,38,44)
TEXT=(244,244,245); MUTED=(156,163,175); WARN=(245,158,11)
W,H = 390, 844

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))

def vgrad(w,h,top,bot):
    img=Image.new("RGB",(w,h))
    px=img.load()
    for y in range(h):
        c=lerp(top,bot,y/max(1,h-1))
        for x in range(w): px[x,y]=c
    return img

def diag_grad(w,h,colors):
    img=Image.new("RGB",(w,h)); px=img.load()
    n=len(colors)
    for y in range(h):
        for x in range(w):
            t=((x/w)+(y/h))/2
            seg=t*(n-1); i=min(int(seg),n-2); f=seg-i
            px[x,y]=lerp(colors[i],colors[i+1],f)
    return img

def rrect(d,box,r,fill=None,outline=None,width=1):
    d.rounded_rectangle(box,radius=r,fill=fill,outline=outline,width=width)

def text(d,xy,s,f,fill=TEXT,anchor="la"):
    d.text(xy,s,font=f,fill=fill,anchor=anchor)

def pill(d,x,y,s,f,fg,bg,pad=10,h=None):
    w=d.textlength(s,font=f); ph=h or (f.size+10)
    rrect(d,[x,y,x+w+pad*2,y+ph],ph/2,fill=bg)
    text(d,(x+pad,y+ph/2),s,f,fill=fg,anchor="lm")
    return w+pad*2

def screen():
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    # status bar
    text(d,(20,18),"9:41",font(14,True),TEXT)
    d.text((W-20,18),"●●● ▮",font=font(13),fill=TEXT,anchor="ra")
    return img,d

def frame(img):
    bez=14
    out=Image.new("RGB",(W+bez*2,H+bez*2),(0,0,0))
    m=Image.new("L",img.size,0); md=ImageDraw.Draw(m)
    md.rounded_rectangle([0,0,W,H],radius=38,fill=255)
    od=ImageDraw.Draw(out)
    od.rounded_rectangle([2,2,W+bez*2-2,H+bez*2-2],radius=50,outline=(40,40,46),width=2)
    out.paste(img,(bez,bez),m)
    return out

def paste_round(base,img,x,y,r):
    m=Image.new("L",img.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,img.size[0],img.size[1]],radius=r,fill=255)
    base.paste(img,(x,y),m)

def brand_title(d,x,y):
    text(d,(x,y),"Staff",font(20,True),TEXT,anchor="lm")
    wx=d.textlength("Staff",font=font(20,True))
    text(d,(x+wx,y),"Swipe",font(20,True),PRIMARY,anchor="lm")

# ---------- 1. AUTH ----------
def auth():
    img,d=screen()
    g=diag_grad(56,56,[(255,122,61),PRIMARY,SECONDARY]); paste_round(img,g,24,70,18)
    d=ImageDraw.Draw(img)
    text(d,(46,98),"⚡",font(26,True),(255,255,255),anchor="mm")
    text(d,(92,98),"StaffSwipe",font(30,True),PRIMARY,anchor="lm")
    text(d,(24,170),"Вход по телефону",font(26,True),TEXT)
    text(d,(24,206),"Отправим SMS с кодом подтверждения",font(13),MUTED)
    rrect(d,[24,240,W-24,294],12,fill=SURFACE,outline=BORDER)
    text(d,(44,267),"📱",font(18),MUTED,anchor="lm")
    text(d,(74,267),"+7 999 123-45-67",font(20,True),TEXT,anchor="lm")
    rrect(d,[24,308,W-24,362],12,fill=PRIMARY)
    text(d,(W/2,335),"Получить код",font(16,True),(255,255,255),anchor="mm")
    text(d,(W/2,392),"— или войти через —",font(12),MUTED,anchor="mm")
    rrect(d,[24,414,189,464],12,outline=BORDER,width=1); text(d,(106,439),"VK ID",font(15,True),(0,119,255),anchor="mm")
    rrect(d,[201,414,W-24,464],12,outline=BORDER,width=1); text(d,(295,439),"Telegram",font(15,True),(34,158,217),anchor="mm")
    text(d,(W/2,H-70),"Сервис только для 18+. Нажимая «Получить код»,",font(11),MUTED,anchor="mm")
    text(d,(W/2,H-52),"вы соглашаетесь с условиями сервиса.",font(11),MUTED,anchor="mm")
    return img

# ---------- 2. ROLE ----------
def role_card(d,img,y,title,sub,grad,icon):
    rrect(d,[16,y,W-16,y+92],16,fill=CARD,outline=BORDER)
    g=diag_grad(56,56,grad); paste_round(img,g,36,y+18,16)
    d=ImageDraw.Draw(img)
    text(d,(64,y+46),icon,font(26),(255,255,255),anchor="mm")
    text(d,(108,y+30),title,font(16,True),TEXT)
    text(d,(108,y+56),sub,font(12),MUTED)
    text(d,(W-34,y+46),"›",font(28),MUTED,anchor="mm")

def role():
    img,d=screen()
    text(d,(24,80),"Кто вы?",font(26,True),TEXT)
    text(d,(24,116),"Это можно будет поменять позже",font(13),MUTED)
    role_card(d,img,150,"Я ищу подработку","Официант, бариста, повар, бармен, хостес",[(255,122,61),SECONDARY],"💼")
    d=ImageDraw.Draw(img)
    role_card(d,img,258,"Я ищу сотрудников","Кафе, ресторан, бар, кофейня",[(59,130,246),(99,102,241)],"🏪")
    return img

# ---------- 3. FEED (swipe) ----------
def feed():
    img,d=screen()
    brand_title(d,20,52)
    text(d,(W-24,52),"≡",font(22,True),TEXT,anchor="rm")
    text(d,(20,84),"Смены рядом с вами · 4",font(12),MUTED)
    # card
    cx0,cy0,cx1,cy1=16,104,W-16,624
    photo=vgrad(cx1-cx0,cy1-cy0,(60,42,30),(20,14,10))
    pd=ImageDraw.Draw(photo)
    pd.ellipse([60,40,200,180],fill=(90,64,44)); pd.ellipse([180,120,300,260],fill=(74,52,38))
    # bottom dark gradient
    grad=Image.new("RGBA",(cx1-cx0,cy1-cy0),(0,0,0,0)); gp=grad.load()
    for yy in range(cy1-cy0):
        t=max(0,(yy/(cy1-cy0)-0.45)/0.55); a=int(225*max(0,t))
        for xx in range(cx1-cx0): gp[xx,yy]=(0,0,0,a)
    photo=Image.alpha_composite(photo.convert("RGBA"),grad).convert("RGB")
    paste_round(img,photo,cx0,cy0,24)
    d=ImageDraw.Draw(img)
    rrect(d,[cx0,cy0,cx1,cy1],24,outline=BORDER,width=1)
    # top pills
    pill(d,cx0+14,cy0+14,"💰 350 ₽/час",font(14,True),(255,255,255),(0,0,0))
    s="📍 1.6 км"; w=d.textlength(s,font=font(13,True))
    pill(d,cx1-14-(w+20),cy0+14,s,font(13,True),(255,255,255),(0,0,0))
    # swipe stamp ХОЧУ
    rot=Image.new("RGBA",(170,70),(0,0,0,0)); rd=ImageDraw.Draw(rot)
    rd.rounded_rectangle([2,2,168,68],radius=12,outline=LIKE,width=5)
    rd.text((85,35),"ХОЧУ",font=font(34,True),fill=LIKE,anchor="mm")
    rot=rot.rotate(18,expand=True); img.paste(rot,(cx0+24,cy0+30),rot)
    d=ImageDraw.Draw(img)
    # bottom info
    by=cy1-186
    x=pill(d,cx0+20,by,"☕ Бариста",font(13,True),(255,255,255),PRIMARY)
    pill(d,cx0+20+x+8,by,"✓ Проверен",font(12,True),INFO,(20,40,70))
    text(d,(cx0+20,by+44),"Кофейня «Дрова»",font(26,True),(255,255,255))
    text(d,(cx0+20,by+82),"завтра · 08:00–16:00",font(13),(220,220,225))
    text(d,(cx0+20,by+104),"ул. Льва Толстого, 16",font(13),(220,220,225))
    text(d,(cx0+20,by+128),"Нужен бариста на утро. Напитки и обеды бесплатно.",font(12),(235,235,240))
    pill(d,cx0+20,by+150,"⚕ Медкнижка",font(11,True),WARN,(60,46,16))
    pill(d,cx0+150,by+150,"≈ 2800 ₽/смена",font(11,True),LIKE,(18,46,30))
    # action bar
    ay=H-92
    def circ(cx,r,color,glyph,gs):
        d.ellipse([cx-r,ay-r,cx+r,ay+r],fill=SURFACE,outline=color,width=2)
        text(d,(cx,ay),glyph,font(gs,True),color,anchor="mm")
    circ(70,22,AMBER,"↺",24); circ(140,30,DISLIKE,"✕",30)
    circ(210,26,SUPER,"⚡",26); circ(290,30,LIKE,"♥",30)
    return img

# ---------- 4. MATCH ----------
def match():
    img=Image.new("RGB",(W,H),(8,8,11)); d=ImageDraw.Draw(img)
    # confetti
    import random; random.seed(7)
    cols=[PRIMARY,SECONDARY,AMBER,LIKE,INFO]
    for i in range(60):
        x=random.randint(10,W-10); y=random.randint(40,H-200); s=random.randint(5,11)
        d.rounded_rectangle([x,y,x+s,y+s],radius=2,fill=cols[i%5])
    text(d,(W/2,250),"Это мэтч!",font(46,True),PRIMARY,anchor="mm")
    text(d,(W/2,320),"🤝",font(70),TEXT,anchor="mm")
    text(d,(W/2,372),"Вы и «Кофейня «Дрова»» понравились",font(15),MUTED,anchor="mm")
    text(d,(W/2,394),"друг другу",font(15),MUTED,anchor="mm")
    ph=diag_grad(120,120,[(90,64,44),(60,42,30)]); paste_round(img,ph,W//2-60,430,18)
    d=ImageDraw.Draw(img)
    rrect(d,[40,580,W-40,634],12,fill=PRIMARY); text(d,(W/2,607),"💬  Перейти в чат",font(16,True),(255,255,255),anchor="mm")
    text(d,(W/2,664),"Продолжить листать",font(14),MUTED,anchor="mm")
    return img

# ---------- 5. CHAT ----------
def bubble(d,img,x,y,s,mine,maxw=250):
    f=font(14); lines=[]; cur=""
    for word in s.split():
        if d.textlength(cur+" "+word,font=f)<maxw-28: cur=(cur+" "+word).strip()
        else: lines.append(cur); cur=word
    lines.append(cur)
    tw=max(d.textlength(l,font=f) for l in lines); bw=tw+28; bh=len(lines)*20+18
    bx=W-16-bw if mine else 16
    col=PRIMARY if mine else CARD
    d.rounded_rectangle([bx,y,bx+bw,y+bh],radius=14,fill=col,outline=None if mine else BORDER)
    for i,l in enumerate(lines):
        text(d,(bx+14,y+10+i*20),l,f,(255,255,255) if mine else TEXT)
    return y+bh+10

def chat():
    img,d=screen()
    # appbar
    ph=diag_grad(38,38,[(90,64,44),(60,42,30)]); paste_round(img,ph,52,44,10)
    d=ImageDraw.Draw(img)
    text(d,(20,60),"‹",font(26,True),TEXT,anchor="lm")
    text(d,(100,52),"Кофейня «Дрова»",font(16,True),TEXT)
    d.ellipse([100,72,107,79],fill=LIKE); text(d,(114,75),"онлайн",font(12),MUTED,anchor="lm")
    # shift banner
    rrect(d,[16,96,W-16,150],14,fill=(40,24,14),outline=(90,52,24))
    text(d,(34,108),"📅",font(18),PRIMARY,anchor="lm")
    text(d,(58,108),"Бариста · 350 ₽/час",font(15,True),TEXT)
    text(d,(58,130),"завтра · 08:00–16:00",font(12),MUTED)
    pill(d,W-118,112,"Мэтч",font(11,True),PRIMARY,(50,30,16))
    # messages
    y=168
    d.rounded_rectangle([60,y,W-60,y+44],radius=12,fill=SURFACE,outline=BORDER)
    text(d,(W/2,y+22),"Это мэтч! Смена «Бариста» 16 июн.",font(11),MUTED,anchor="mm")
    y+=58
    y=bubble(d,img,0,y,"Здравствуйте! Готовы выйти на смену? Какие вопросы?",False)
    y=bubble(d,img,0,y,"Да, всё отлично. Во сколько подойти?",True)
    y=bubble(d,img,0,y,"К 7:45, форму выдадим на месте 👍",False)
    # confirm + composer
    rrect(d,[16,H-150,W-16,H-110],10,outline=LIKE,width=2)
    text(d,(W/2,H-130),"🤝  Подтвердить смену",font(15,True),LIKE,anchor="mm")
    rrect(d,[16,H-96,W-78,H-52],12,fill=SURFACE,outline=BORDER)
    text(d,(32,H-74),"Сообщение…",font(14),MUTED,anchor="lm")
    d.ellipse([W-68,H-96,W-24,H-52],fill=PRIMARY); text(d,(W-46,H-74),"➤",font(18,True),(255,255,255),anchor="mm")
    return img

# ---------- 6. SHIFTS ----------
def shifts():
    img,d=screen()
    text(d,(20,56),"Мои смены",font(20,True),TEXT)
    rrect(d,[16,96,W-16,300],16,fill=CARD,outline=BORDER)
    text(d,(32,112),"Кофейня «Дрова»",font(16,True),TEXT)
    pill(d,W-150,110,"Смена подтверждена",font(10,True),LIKE,(18,46,30))
    rows=[("💼","Бариста"),("📅","16 июня, понедельник"),("🕗","08:00–16:00"),("👛","≈ 2800 ₽")]
    yy=146
    for ic,tx in rows:
        text(d,(32,yy),ic,font(15),MUTED,anchor="lm"); text(d,(58,yy),tx,font(15),TEXT,anchor="lm"); yy+=30
    rrect(d,[32,266,W-32,304],10,outline=PRIMARY,width=2)
    text(d,(W/2,285),"📄  Сформировать акт (PDF)",font(14,True),PRIMARY,anchor="mm")
    # second
    rrect(d,[16,320,W-16,392],16,fill=CARD,outline=BORDER)
    text(d,(32,338),"Бар «Полночь»",font(16,True),TEXT)
    pill(d,W-150,336,"Завершено",font(10,True),MUTED,(40,40,46))
    text(d,(32,366),"Бармен · 18 июня · ≈ 4500 ₽",font(13),MUTED)
    # bottom nav
    d.line([0,H-64,W,H-64],fill=BORDER)
    labels=[("▣","Лента",MUTED),("♥","Мэтчи",MUTED),("▦","Смены",PRIMARY),("◔","Профиль",MUTED)]
    for i,(ic,lb,col) in enumerate(labels):
        cx=W/8+i*W/4
        text(d,(cx,H-44),ic,font(18,True),col,anchor="mm"); text(d,(cx,H-22),lb,font(10),col,anchor="mm")
    return img

screens=[("1_auth",auth),("2_role",role),("3_feed",feed),("4_match",match),("5_chat",chat),("6_shifts",shifts)]
imgs=[]
for name,fn in screens:
    im=frame(fn()); im.save(os.path.join(OUT,f"{name}.png")); imgs.append(im)
    print("saved",name)

# contact sheet
pad=24; cols=3; rows=2
cw,ch=imgs[0].size
sheet=Image.new("RGB",(cols*cw+pad*(cols+1),rows*ch+pad*(rows+1)),(18,18,22))
for i,im in enumerate(imgs):
    r,c=divmod(i,cols)
    sheet.paste(im,(pad+c*(cw+pad),pad+r*(ch+pad)))
sheet.save(os.path.join(OUT,"overview.png"))
print("saved overview", sheet.size)
