import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/store/session";
import {
  billingDocUrl,
  fetchAdminOverview,
  fetchMe,
  fetchMyCommission,
  fetchReferral,
  setAvailability,
  type VerifyResult,
  verifyEmployer,
  walletTopup,
} from "@/api/endpoints";
import { share, haptic, confirmAction, openExternal } from "@/telegram/sdk";
import {
  IconBolt,
  IconGift,
  IconEdit,
  IconHelp,
  IconShield,
  IconStore,
  IconBriefcase,
  IconCheck,
  IconBookmark,
  IconChevronRight,
  IconStar,
} from "@/components/Icons";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { PILOT_MODE } from "@/lib/flags";
import { plural } from "@/lib/format";

function CommissionCard() {
  const { data: bill } = useQuery({
    queryKey: ["my-commission"],
    queryFn: fetchMyCommission,
  });
  const [busy, setBusy] = useState(false);
  if (!bill) return null;
  const due = bill.pendingRub > 0;

  async function topup(amount: number) {
    setBusy(true);
    try {
      const { url } = await walletTopup(amount);
      haptic("light");
      openExternal(url);
    } catch {
      haptic("error");
      toast("Оплата не открылась — попробуйте ещё раз", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        ...(bill.overdue
          ? { border: "1.5px solid var(--danger)" }
          : null),
      }}
    >
      <div className="row">
        <b>Комиссия сервиса · {bill.pct}%</b>
        <span className="spacer" />
        <b style={{ color: due ? "var(--gold)" : "var(--muted)" }}>
          {bill.pendingRub.toLocaleString("ru-RU")} ₽
        </b>
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: "var(--text-sm)" }}>
        {due
          ? `Смен к оплате: ${bill.pendingShifts}. Спишется с баланса ` +
            `автоматически — пополните его картой ниже.`
          : "Платите только за смены, которые состоялись."}
      </div>
      {bill.overdue && (
        <div style={{ marginTop: 8, fontSize: "var(--text-sm)", color: "var(--danger)", fontWeight: 700 }}>
          Баланс закончился — новые смены пока не публикуются. Пополните
          ниже, и всё снова заработает.
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <span className="muted" style={{ fontSize: "var(--text-sm)" }}>Баланс</span>
        <span className="spacer" />
        <b>{bill.balanceRub.toLocaleString("ru-RU")} ₽</b>
      </div>
      {/* Документы для бухгалтерии. Ресторан-юрлицо не проведёт оплату по
          безналу без счёта с реквизитами и не поставит расход без акта —
          «оплатите картой» для него не ответ. Кнопки показываем только когда
          есть за что платить. */}
      {due && bill.docsAvailable !== false && (
        <>
          <div className="muted" style={{ marginTop: 12, fontSize: "var(--text-xs)" }}>
            Документы для бухгалтерии
          </div>
          <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "wrap" }}>
            {([["invoice", "Счёт на оплату"], ["act", "Акт услуг"]] as const).map(
              ([kind, label]) => (
                <button
                  key={kind}
                  className="tag"
                  style={{ flex: 1, minWidth: 120, cursor: "pointer" }}
                  onClick={() => {
                    haptic("light");
                    openExternal(billingDocUrl(kind));
                  }}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </>
      )}
      {/* Реквизиты ещё не заполнены — документы не выдаются. Молча рисовать
          кнопки нельзя: заведение упирается в отказ ровно в тот момент,
          когда собралось платить. */}
      {due && bill.docsAvailable === false && (
        <div className="muted" style={{ marginTop: 12, fontSize: "var(--text-xs)" }}>
          Нужен счёт или акт для бухгалтерии? Напишите в поддержку — пришлём.
        </div>
      )}

      {bill.topupAvailable ? (
        <>
          <div className="muted" style={{ marginTop: 12, fontSize: "var(--text-xs)" }}>
            Пополнить баланс
          </div>
          {/* На чипе оставляем только сумму: «Пополнить 1 000 ₽» в трети
              ширины экрана переносилось на 3-4 строки и ломало ряд. */}
          <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "wrap" }}>
            {[1000, 3000, 5000].map((a) => (
              <button
                key={a}
                className="tag"
                disabled={busy}
                style={{
                  flex: 1,
                  minWidth: 88,
                  cursor: "pointer",
                  borderColor: "var(--gold)",
                  color: "var(--gold)",
                }}
                onClick={() => topup(a)}
              >
                {a.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="muted" style={{ marginTop: 8, fontSize: "var(--text-xs)" }}>
          Оплата картой пока не подключена. Нужно пополнить баланс —
          напишите в поддержку.
        </div>
      )}
    </div>
  );
}

function EmployerVerify() {
  const [inn, setInn] = useState("");
  const [res, setRes] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setRes(await verifyEmployer(inn));
      haptic("success");
    } catch {
      haptic("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <b>Подтвердить компанию по ИНН</b>
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <input
          className="input"
          inputMode="numeric"
          placeholder="ИНН"
          value={inn}
          onChange={(e) => setInn(e.target.value)}
        />
        {/* Кнопка узкая, в один ряд с полем ИНН: block={false}, высота 46 —
            вровень с input. Свой busy оставлен: он же гасит кнопку по длине
            ИНН и даёт спиннер до того, как отработает внутренняя защита. */}
        <Button
          block={false}
          style={{ padding: "0 16px", height: 46 }}
          loading={busy}
          disabled={busy || inn.length < 10}
          onClick={run}
        >
          Проверить
        </Button>
      </div>
      {res && (
        <div className="muted" style={{ marginTop: 10 }}>
          {res.found ? (
            <>
              {res.verified && (
                <span style={{ color: "var(--super-text)", display: "inline-flex", verticalAlign: "-3px", marginRight: 4 }}>
                  <IconCheck size={15} />
                </span>
              )}
              <b style={{ color: "var(--text)" }}>{res.name}</b>
              {res.ogrn && <> · ОГРН {res.ogrn}</>}
              {res.address && <div>{res.address}</div>}
            </>
          ) : null}
          {res.hint && <div style={{ marginTop: 4 }}>{res.hint}</div>}
        </div>
      )}
    </div>
  );
}


// «Готов выйти сегодня» — тумблер доступности. Заведения со срочной сменой
// видят такого человека первым в ленте кандидатов.
function AvailabilityCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  // Профиль приходит с сервера уже после первой отрисовки, и без этой
  // синхронизации тумблер навсегда оставался выключенным: человек включал
  // доступность, возвращался в профиль — и видел «выключено».
  useEffect(() => setOn(initial), [initial]);

  async function toggle() {
    const next = !on;
    setOn(next);
    setBusy(true);
    haptic("select");
    try {
      await setAvailability(next);
      toast(next ? "Вы готовы выйти сегодня" : "Отметку убрали", "success");
    } catch {
      setOn(!next); // откат при ошибке
      toast("Отметка не сохранилась. Попробуйте ещё раз", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="card row"
      style={{
        marginBottom: 16,
        border: on ? "1px solid var(--gold)" : undefined,
        // --gold-tint: в тёмной теме прежние 6% багрового на тёмной карточке
        // были неотличимы от выключенного состояния.
        background: on ? "var(--gold-tint)" : undefined,
      }}
    >
      <span style={{ flex: 1 }}>
        <b style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {on && <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconBolt size={15} /></span>}
          {on ? "Готов выйти сегодня" : "Готов выйти сегодня?"}
        </b>
        <div className="muted">
          {on
            ? "Вы наверху списка — на срочные смены позовут первым"
            : "Включите — и срочные смены найдут вас быстрее"}
        </div>
      </span>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Готов выйти сегодня"
        disabled={busy}
        onClick={toggle}
        // Дорожка визуально 52×30, высота кнопки 44px — минимальная зона тапа.
        style={{
          width: 52,
          height: 44,
          padding: 0,
          borderRadius: 999,
          border: "none",
          background: "none",
          cursor: "pointer",
          position: "relative",
          flex: "none",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 7,
            left: 0,
            width: 52,
            height: 30,
            borderRadius: 999,
            transition: "background 0.2s",
            background: on ? "var(--gold-fill)" : "var(--border-strong)",
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            left: on ? 25 : 3,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--surface)",
            boxShadow: "0 1px 3px rgba(60,20,25,.35)",
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

// Доступность: крупные кнопки и текст. Состояние — на <body data-large>,
// сохраняется в localStorage и применяется при старте (main.tsx).
// Заполненность анкеты. С фото и опытом зовут заметно чаще — показываем
// прогресс и мягко подталкиваем дополнить недостающее.
function ProfileMeter({ pct }: { pct: number }) {
  const nav = useNavigate();
  if (pct >= 100) return null;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {/* Подпись под заголовком, а не сбоку от него: на узком экране она
          втискивалась в остаток строки и рвалась пополам («заполните до /
          конца»), а заголовок при этом тоже ломался. */}
      <b style={{ display: "block", marginBottom: 8 }}>
        Профиль готов на {pct}%
      </b>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: "var(--grad-brand)",
            transition: "width 0.8s ease",
          }}
        />
      </div>
      <div className="muted" style={{ margin: "10px 0 12px" }}>
        Анкеты с фото и опытом зовут на смены заметно чаще.
      </div>
      <Button variant="secondary" onClick={() => nav("/profile/edit")}>
        <span className="inline">
          <IconEdit size={18} /> Дополнить профиль
        </span>
      </Button>
    </div>
  );
}

export function ProfilePage() {
  const nav = useNavigate();
  const { role, logout } = useSession();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: ref } = useQuery({
    queryKey: ["referral"],
    queryFn: fetchReferral,
  });
  // Ссылка на админ-панель появляется только у админа (проба эндпоинта).
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fetchAdminOverview().then(() => true).catch(() => false),
    retry: false,
  });

  function invite() {
    if (!ref) return;
    haptic("light");
    share(ref.link, "Лови смены в общепите рядом — StaffSwipe 🔥");
  }

  return (
    <div className="page">
      {/* «Выйти» переехал в конец списка внизу: деструктивное действие не
          должно быть самым заметным элементом шапки. */}
      <div className="row" style={{ marginBottom: 16 }}>
        <h1 className="h1" style={{ margin: 0 }}>Профиль</h1>
      </div>

      <div className="card row" style={{ gap: 14, marginBottom: 16 }}>
        {/* Фото из Telegram, если оно есть; иначе первая буква имени.
            Раньше вместо лица стояла иконка-портфель — та самая, которой на
            экране выбора роли подписано «Я ищу подработку». В своём профиле
            она читается как «вакансия», а не «это я». */}
        <span style={{
          width: 56, height: 56, borderRadius: 16, flex: "none",
          background: "var(--grad-brand)", color: "var(--on-brand)",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", fontWeight: 800, fontSize: "var(--text-xl)",
        }}>
          {me?.photoUrl ? (
            <img
              src={me.photoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : me?.name ? (
            me.name.trim().charAt(0).toUpperCase()
          ) : role === "employer" ? (
            <IconStore size={30} />
          ) : (
            <IconBriefcase size={30} />
          )}
        </span>
        <span className="grow">
          <div style={{ fontWeight: 800, fontSize: "var(--text-lg)", overflowWrap: "anywhere" }}>
            {me?.name ?? (role === "employer" ? "Добавьте название" : "Добавьте имя")}
          </div>
          <div className="muted">
            {me ? (me.rating > 0 ? (
              <><IconStar size={13} /> {me.rating.toFixed(1)}</>
            ) : "Новичок") : "—"}
            {me?.tgUsername ? ` · @${me.tgUsername}` : ""}
            {me?.shiftsDone
              ? ` · ${me.shiftsDone} ${plural(me.shiftsDone, "смена", "смены", "смен")}`
              : ""}
          </div>
        </span>
      </div>

      {!!me?.incomingLikes && me.incomingLikes > 0 && (
        // Кнопка, а не div с onClick: это единственный вход на самый ценный
        // экран, и клавиатурой в него было не попасть, а озвучка читала его
        // как обычный текст. Заливка — из токенов заливки: в тёмной теме
        // прежний градиент давал под белым текстом 3.2:1.
        <button
          className="card"
          onClick={() => nav(role === "seeker" ? "/invites" : "/applicants")}
          style={{
            width: "100%",
            textAlign: "left",
            marginBottom: 16,
            background:
              "linear-gradient(135deg, var(--gold-fill-soft), var(--gold-fill))",
            color: "var(--on-brand)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <b style={{ fontSize: "var(--text-md)", display: "flex", alignItems: "center", gap: 7 }}>
            <IconBolt size={18} />
            {role === "employer"
              ? `Новых откликов: ${me.incomingLikes}`
              : `Вас зовут на смены: ${me.incomingLikes}`}
          </b>
          {/* line-height здесь обязателен: это <button>, а браузер даёт кнопке
              своё «normal» (около 1.2) и общий межстрочный из body внутрь не
              попадает. Строки слипались ровно там, где объясняется, что
              произойдёт по нажатию. */}
          <div style={{ fontSize: "var(--text-sm)", marginTop: 2, lineHeight: 1.5 }}>
            {role === "employer"
              ? "Посмотреть, кто откликнулся"
              : "Посмотреть, кто зовёт"}
          </div>
        </button>
      )}


      {/* Фото заведения. У работника есть полоса «профиль готов на 70%», и
          она работает; у заведения такой подсказки не было вообще — при том
          что именно от его фото зависит, откликнутся ли на смену. Карточка
          показывается, только пока фото нет. */}
      {role === "employer" && me && !me.photoUrl && (
        <button
          className="card"
          onClick={() => nav("/profile/edit")}
          style={{
            width: "100%",
            textAlign: "left",
            marginBottom: 16,
            border: "1px solid var(--border-strong)",
            cursor: "pointer",
          }}
        >
          <b style={{ fontSize: "var(--text-md)" }}>Добавьте фото заведения</b>
          <div className="muted" style={{ marginTop: 4, fontSize: "var(--text-sm)" }}>
            С фотографией зала на ваши смены откликаются заметно чаще.
          </div>
        </button>
      )}

      {role === "employer" && me && !!me.shiftsDone && me.shiftsDone > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row">
            <b>Смен проведено</b>
            <span className="spacer" />
            <b style={{ color: "var(--gold)", fontSize: "var(--text-lg)" }}>{me.shiftsDone}</b>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: "var(--text-xs)" }}>
            Из закрытых смен складывается рейтинг — его видно ещё до отклика.
          </div>
        </div>
      )}

      {role === "seeker" && me && (
        <ProfileMeter pct={me.profileCompletion ?? 100} />
      )}

      {role === "seeker" && (
        <AvailabilityCard initial={me?.availableToday ?? false} />
      )}

      {role === "employer" && <CommissionCard />}

      {role === "employer" && !PILOT_MODE && <EmployerVerify />}

      <div className="card" style={{ marginBottom: 16 }}>
        <b>{role === "employer" ? "Пригласить коллег-рестораторов" : "Пригласить друзей"}</b>
        <div className="muted" style={{ margin: "6px 0 12px" }}>
          {role === "employer"
            ? "Чем больше рядом заведений и людей, тем быстрее закрываются смены у всех."
            : "Чем больше рядом людей, тем чаще заведения ищут именно здесь."}
          {" "}
          {/* «Пришло по ссылке: 0» — цифра в хвосте фразы, которую читают на
              бегу. Ноль лучше сказать словами: он и так самый частый. */}
          {ref?.invited
            ? `По вашей ссылке уже пришли: ${ref.invited}.`
            : "По вашей ссылке пока никто не пришёл."}
        </div>
        <Button onClick={invite}>
          <span className="inline">
            <IconGift size={18} /> Поделиться приглашением
          </span>
        </Button>
      </div>

      {/* Раньше здесь стоял столбик из 4-5 одинаковых полноширинных кнопок —
          читалось как отладочное меню. Теперь это один список со строками. */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <MenuRow
          icon={<IconEdit size={18} />}
          label="Редактировать профиль"
          onClick={() => nav("/profile/edit")}
        />
        {role === "seeker" && (
          <MenuRow
            icon={<IconBookmark size={18} />}
            label="Избранные смены"
            onClick={() => nav("/favorites")}
          />
        )}
        <MenuRow
          icon={<IconShield size={18} />}
          label="Настройки"
          onClick={() => nav("/settings")}
        />
        <MenuRow
          icon={<IconHelp size={18} />}
          label="Помощь и поддержка"
          onClick={() => nav("/support")}
        />
        {isAdmin && (
          <MenuRow
            icon={<IconShield size={18} />}
            label="Админ-панель"
            onClick={() => nav("/admin")}
          />
        )}
        <MenuRow
          label="Выйти из аккаунта"
          danger
          last
          onClick={async () => {
            // Подтверждение: случайно вылететь из аккаунта неприятно.
            if (!(await confirmAction("Выйти из аккаунта?", "Выйти"))) return;
            logout();
            nav("/onboarding", { replace: true });
          }}
        />
      </div>
    </div>
  );
}

/** Строка списка в профиле: иконка — подпись — шеврон. Высота ≥52px. */
function MenuRow({
  icon,
  label,
  onClick,
  danger = false,
  last = false,
}: {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        minHeight: 54,
        padding: "0 18px",
        background: "none",
        border: "none",
        borderBottom: last ? "none" : "1px solid var(--border)",
        color: danger ? "var(--danger)" : "var(--text)",
        fontSize: "var(--text-md)",
        fontWeight: 600,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {/* Плейсхолдер держит колонку иконок: без него строка без иконки
          съезжала влево относительно остальных. */}
      <span style={{ display: "inline-flex", width: 18, color: "var(--gold)" }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {/* Шеврон = «откроется экран». У «Выйти» экрана нет — там подтверждение. */}
      {!danger && <IconChevronRight size={18} />}
    </button>
  );
}
