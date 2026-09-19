from pathlib import Path
from html import escape
import calendar
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[1] / 'design' / 'harucheck-figma.svg'
LIGHT = dict(ink='#202A35', bg='#F6F7FB', surface='#FFFFFF', lime='#D9FA70', green='#287A53', red='#C55A50', muted='#737E8C', line='#E8ECF1', field='#F1F3F7', event_bg='#245EEA', event_text='#FFFFFF', event_done_bg='#157A46', event_done_text='#FFFFFF', event_failed_bg='#C83949', event_failed_text='#FFFFFF', done='#EAF4ED', failed='#FAEDEA')
DARK = dict(ink='#EDF2F7', bg='#11161F', surface='#1B2430', lime='#D9FA70', green='#83D6AC', red='#F1A099', muted='#A7B2C3', line='#303C4B', field='#25313F', event_bg='#83B4FF', event_text='#102B53', event_done_bg='#73DDA2', event_done_text='#093C26', event_failed_bg='#FF9AA5', event_failed_text='#531921', done='#233F35', failed='#4A3032')
C = LIGHT
parts=[]

def el(s): parts.append(s)
def rect(x,y,w,h,fill,rx=0,stroke=None):
    el(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+'/>')
def text(x,y,s,size=14,fill=None,weight=400,anchor='start'):
    el(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill or C["ink"]}" font-weight="{weight}" text-anchor="{anchor}">{escape(s)}</text>')
def line(x1,y1,x2,y2,color=None,width=1): el(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color or C["line"]}" stroke-width="{width}" stroke-linecap="round"/>')
def circle(x,y,r,fill,stroke=None): el(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="1.8"' if stroke else '')+'/>')
def path(d,stroke=None,width=2,fill='none'): el(f'<path d="{d}" stroke="{stroke or C["ink"]}" stroke-width="{width}" fill="{fill}" stroke-linecap="round" stroke-linejoin="round"/>')
def chevron(x,y,direction=1): path(f'M {x-direction*3} {y-5} l {direction*5} 5 l {-direction*5} 5',width=1.8)
def check(x,y,color): path(f'M {x-5} {y} l 3.5 3.5 l 6.5 -7',color,2)
def cross(x,y,color):
    line(x-4,y-4,x+4,y+4,color,1.8);line(x+4,y-4,x-4,y+4,color,1.8)
def button(x,y,w,label,fill=None,fg=None,h=52):
    rect(x,y,w,h,fill or C['lime'],16)
    text(x+w/2,y+h/2+5,label,15,fg or '#202A35',700,'middle')
def statusbar():
    text(24,28,'9:41',13,weight=700)
    for i,h in enumerate([4,6,8,10]): rect(305+i*4,27-h,2.5,h,C['ink'],1)
    path('M 328 20 Q 334 14 340 20 M 330 23 Q 334 19 338 23',C['ink'],1.5)
    circle(334,26,1.3,C['ink'])
    rect(349,17,18,10,'none',2,C['ink']);rect(351,19,13,6,C['ink'],1);rect(368,20,2,4,C['ink'],1)
def theme_switch(dark=False):
    rect(232,51,134,38,C['field'],12)
    rect(299 if dark else 235,54,64,32,C['lime'],10)
    text(267,75,'화이트',11,'#202A35' if not dark else C['muted'],700,'middle')
    text(331,75,'다크',11,'#202A35' if dark else C['muted'],700,'middle')
def event_label(x,y,title,status='예정'):
    bg={'예정':C['event_bg'],'완료':C['event_done_bg'],'실패':C['event_failed_bg']}[status]
    fg={'예정':C['event_text'],'완료':C['event_done_text'],'실패':C['event_failed_text']}[status]
    # A filled label should never inherit a pale border in dark mode.
    rect(x,y,44,18,bg,5,stroke='none')
    if status=='완료':
        path(f'M {x+4} {y+9} l 2 2 l 4 -4',fg,1.2)
    if status=='실패':
        line(x+4,y+6,x+9,y+11,fg,1.1);line(x+9,y+6,x+4,y+11,fg,1.1)
    text(x+(12 if status!='예정' else 4),y+12.5,title,9.5,fg,700)
def calendar_card(year,month,selected):
    weeks=calendar.Calendar(firstweekday=6).monthdayscalendar(year,month)
    events={3:[('회의','예정')],8:[('운동','완료')],12:[('약속','예정')],16:[('복습','실패')],22:[('검진','예정')],25:[('쇼핑','예정')],29:[('청소','예정')]}
    events[selected]=[('산책','완료'),('독서','예정')]
    card_h=91+len(weeks)*72+14
    rect(20,144,350,card_h,C['surface'],24)
    chevron(49,176,-1);text(195,183,f'{year}년 {month}월',20,weight=750,anchor='middle');chevron(339,176)
    for col,label in enumerate(['일','월','화','수','목','금','토']): text(51+48*col,216,label,11,C['red'] if col==0 else C['muted'],500,'middle')
    for row,week in enumerate(weeks):
        y=234+row*72
        if row: line(30,y-3,360,y-3)
        for col,day in enumerate(week):
            if not day: continue
            x=29+48*col
            if day==selected: rect(x-1,y-3,46,68,'none',9,C['lime'] if C is DARK else '#A8C948')
            if day==selected: rect(x+10,y-1,24,23,C['lime'],8)
            text(x+22,y+15,str(day),13,'#202A35' if day==selected else (C['red'] if col==0 else C['ink']),700 if day==selected else 500,'middle')
            for n,(title,status) in enumerate(events.get(day,[])):
                event_label(x,y+25+n*21,title,status)
    return 144+card_h

def task(y,title,time,status):
    rect(20,y,350,75,C['surface'],18)
    color={'예정':C['muted'],'완료':C['green'],'실패':C['red']}[status]
    text(35,y+28,title,15,weight=650)
    text(35,y+52,time,11,C['muted'])
    text(205,y+51,status,11,color,600,'end')
    rect(226,y+19,38,38,C['done'] if status=='완료' else C['field'],11)
    check(245,y+38,C['green'] if status=='완료' else C['muted'])
    rect(272,y+19,38,38,C['failed'] if status=='실패' else C['field'],11)
    cross(291,y+38,C['red'] if status=='실패' else C['muted'])
    for dy in [-4,0,4]: circle(339,y+38+dy,1.2,C['muted'])

def home(dark=False,year=2026,month=9,selected=19):
    global C
    C=DARK if dark else LIGHT
    rect(0,0,390,1050,C['bg'],32);statusbar()
    text(24,73,'하루체크',23,weight=800);theme_switch(dark)
    text(24,99,'계획은 가볍게, 하루는 또렷하게.',11,C['muted'])
    text(24,127,'2026 — 2027',11,C['muted'],600)
    rect(309,105,57,27,C['surface'],10);text(337,123,'오늘',11,weight=600,anchor='middle')
    bottom=calendar_card(year,month,selected)
    day_of_week=['월','화','수','목','금','토','일'][calendar.weekday(year,month,selected)]
    text(24,bottom+36,f'{month}월 {selected}일 {day_of_week}요일',18,weight=750)
    text(366,bottom+35,'총 2개',12,C['muted'],anchor='end')
    text(24,bottom+58,'예정 1  ·  완료 1',11,C['muted'])
    task(bottom+76,'산책','오전 7:30','완료')
    task(bottom+162,'독서','오후 8:00','예정')
    text(24,951,'✓ 완료   ·   × 실패   ·   한 번 더 누르면 예정',11,C['muted'])
    button(20,974,350,'+  일정 추가')
    rect(134,1037,122,4,C['ink'],2)

def input_field(y,label,value,placeholder=False,kind=None):
    text(24,y,label,12,C['muted'],600)
    rect(24,y+13,342,54,C['field'],14)
    text(40,y+47,value,14,C['muted'] if placeholder else C['ink'],500)
    if kind=='chevron': chevron(344,y+40)
    if kind=='clock':
        circle(342,y+40,7,'none',C['muted']);path(f'M 342 {y+36} v 4 l 3 2',C['muted'],1.4)

def sheet(dark=False,edit=False):
    home(dark,2027 if dark else 2026,1 if dark else 9,1 if dark else 19)
    rect(0,0,390,1050,'#080D14',32);parts[-1]=parts[-1].replace('fill="#080D14"','fill="#080D14" opacity="0.46"')
    top=180
    rect(0,top,390,1050-top,C['surface'],28);rect(0,top+28,390,1050-top-28,C['surface'])
    rect(173,top+12,44,4,C['line'],2)
    text(24,top+55,'일정 수정' if edit else '일정 추가',22,weight=750)
    rect(322,top+28,44,44,C['field'],14);cross(344,top+50,C['muted'])
    text(24,top+83,'오늘의 계획을 간단히 적어 주세요.',12,C['muted'])
    input_field(top+118,'일정 이름','독서' if edit else '친구와 저녁 식사')
    input_field(top+209,'날짜','2027년 1월 1일 금요일' if dark else '2026년 9월 19일 토요일',kind='chevron')
    input_field(top+300,'시간 · 선택','오후 8:00',kind='clock')
    reminder_options=['알림 없음','30분 전','1시간 전','1시간 30분 전','2시간 전','2시간 30분 전','3시간 전','3시간 30분 전','4시간 전','4시간 30분 전','5시간 전','직접 설정']
    el('<g id="reminder-select-'+('edit' if edit else 'add')+'" data-options="'+escape('|'.join(reminder_options),quote=True)+'">')
    input_field(top+391,'알림','직접 설정' if edit else '1시간 전')
    path(f'M 338 {top+429} l 5 5 l 5 -5',C['muted'],1.8)
    el('</g>')
    if edit:
        text(24,top+483,'알림 날짜',12,C['muted'],600)
        text(230,top+483,'알림 시간',12,C['muted'],600)
        rect(24,top+496,192,52,C['field'],14)
        rect(230,top+496,136,52,C['field'],14)
        text(40,top+529,'2027. 01. 01.',14,weight=550)
        text(246,top+529,'오후 7:00',14,weight=550)
        circle(343,top+521,7,'none',C['muted'])
        path(f'M 343 {top+517} v 4 l 3 2',C['muted'],1.4)
        text(24,top+573,'앱을 열어둔 동안 알림을 확인할 수 있어요.',11,C['muted'])
        text(24,top+614,'상태',12,C['muted'],600)
        for i,label in enumerate(['예정','✓ 완료','× 실패']):
            rect(24+i*118,top+628,106,44,C['lime'] if i==0 else C['field'],13)
            text(77+i*118,top+655,label,13,'#202A35' if i==0 else C['muted'],650,'middle')
        text(195,top+710,'기기 캘린더에 추가',12,C['event_bg'],600,'middle')
        text(195,top+752,'일정 삭제',13,C['red'],600,'middle')
    else:
        text(24,top+483,'30분 단위 · 최대 5시간 전 · 직접 설정',11,C['muted'])
        rect(24,top+513,342,101,C['field'],14)
        circle(48,top+539,9,'none',C['muted'])
        text(48,top+543,'i',12,C['muted'],700,'middle')
        text(66,top+544,'오후 7:00에 알려드려요.',13,weight=650)
        text(40,top+573,'앱을 열어둔 동안 알림을 확인할 수 있어요.',11,C['muted'])
        text(40,top+595,'직접 설정에서 원하는 날짜와 시간을 고르세요.',11,C['muted'])
        text(24,top+666,'달력에 일정 이름이 표시돼요.',12,weight=600)
        text(24,top+690,'여러 일정은 위에서 아래로 차례대로 쌓여요.',11,C['muted'])
    button(24,974,102,'취소',C['field'],C['ink'])
    button(138,974,228,'저장' if edit else '추가')
    rect(134,1037,122,4,C['ink'],2)

el('<svg xmlns="http://www.w3.org/2000/svg" width="1784" height="1298" viewBox="0 0 1784 1298">')
el('<title>하루체크 — 선명한 일정 라벨과 맞춤 알림</title>')
el('<desc>2026·2027년 모바일 캘린더. 화이트 달력, 다크 달력, 화이트 일정 추가, 다크 일정 수정. 일정 이름을 날짜 아래 세로로 쌓아 보여주는 편집 가능한 벡터 UI. 알림 없음, 30분부터 5시간 전까지 30분 단위 알림, 직접 설정으로 날짜와 시간 지정. 다크 모드 라벨은 테두리 없음.</desc>')
el('<g font-family="Noto Sans KR, Malgun Gothic, sans-serif">')
rect(0,0,1784,1298,'#EDEFF3')
rect(40,32,84,28,LIGHT['lime'],14);text(82,51,'HARUCHECK',10,weight=750,anchor='middle')
text(40,99,'하루체크',32,weight=800)
text(204,98,'2026–2027 · 화이트 & 다크 · 일정 라벨과 맞춤 알림',15,LIGHT['muted'])
text(1744,97,'MOBILE APP / 390 × 1050',11,LIGHT['muted'],600,'end')
titles=['01   화이트 · 2026년 9월','02   다크 · 2027년 1월','03   화이트 · 일정 추가','04   다크 · 일정 수정']
for i,x in enumerate([40,478,916,1354]):
    text(x,144,titles[i],13,LIGHT['ink'],650)
    el(f'<g id="screen-{i+1}" transform="translate({x} 165)">')
    if i==0:home()
    elif i==1:home(True,2027,1,1)
    elif i==2:sheet()
    else:sheet(True,True)
    el('</g>')
text(40,1260,'선명한 일정 라벨 · 완료 ✓ / 실패 × · 30분 단위 알림 · 원하는 날짜와 시간에 맞춤 알림',13,LIGHT['muted'])
text(1744,1260,'EDITABLE VECTOR UI',10,LIGHT['muted'],600,'end')
el('</g></svg>')
OUT.write_text('\n'.join(parts),encoding='utf-8')
root=ET.parse(OUT).getroot()
assert calendar.weekday(2026,9,1)==1
assert calendar.weekday(2026,9,19)==5
assert calendar.weekday(2027,1,1)==4
assert len(calendar.Calendar(firstweekday=6).monthdayscalendar(2027,1))==6
assert len(root.findall('.//{http://www.w3.org/2000/svg}image'))==0
assert len(root.findall('.//{http://www.w3.org/2000/svg}text'))>180
assert sum(1 for n in root.findall('.//{http://www.w3.org/2000/svg}g') if n.get('id','').startswith('screen-'))==4
print(f'Wrote {OUT} ({OUT.stat().st_size:,} bytes); XML valid; 4 screens; native editable vectors; September 2026 and January 2027 dates verified.')
