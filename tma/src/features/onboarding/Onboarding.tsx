import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { Wordmark } from "@/components/Wordmark";
import { IconChevronRight, IconChat, IconCheck, IconDoc } from "@/components/Icons";
import { currentCampaign } from "@/lib/campaign";

export function Onboarding() {
  const nav = useNavigate();
  const [details, setDetails] = useState(false);
  const campaign = currentCampaign();
  return (
    <div className="app hospitality-entry">
      <main className="page entry-page">
        <header className="entry-brand"><Wordmark /><span>Люди. Смены. Возможности.</span></header>
        <p className="entry-motto">Хорошие люди делают<br />гостеприимство особенным.</p>
        <h1 className="h1 entry-title">{campaign?.title ?? "Кого вы ищете?"}</h1>
        <p className="muted entry-subtitle">{campaign?.sub ?? "Соединяем людей и заведения в общепите"}</p>
        <div className="entry-roles">
          <button className="entry-role" onClick={() => nav("/role")}>
            <img src="/images/staffswipe-barista.webp" alt="" fetchPriority="high" />
            <span className="entry-role-copy"><small>ДЛЯ СОТРУДНИКОВ</small><strong>Найти свою<br />смену</strong><span>Работа в вашем ритме</span></span>
            <span className="entry-arrow"><IconChevronRight size={22} /></span>
          </button>
          <button className="entry-role" onClick={() => nav("/role")}>
            <img src="/images/staffswipe-restaurant.webp" alt="" />
            <span className="entry-role-copy"><small>ДЛЯ ЗАВЕДЕНИЙ</small><strong>Найти своих<br />людей</strong><span>Команда под вашу смену</span></span>
            <span className="entry-arrow"><IconChevronRight size={22} /></span>
          </button>
        </div>
        <Button className="entry-cta" onClick={() => nav("/role")}>Регистрация / Войти <IconChevronRight size={18} /></Button>
        <button className="text-btn" aria-expanded={details} aria-controls="entry-how" onClick={() => setDetails(!details)}>Как это работает</button>
        {details && <ol id="entry-how" className="entry-how">
          <li><IconCheck size={20} /><span>Выберите смену или сотрудника. Отклик и приглашение показывают взаимный интерес.</span></li>
          <li><IconChat size={20} /><span>Обсудите детали в чате и подтвердите условия обеими сторонами.</span></li>
          <li><IconDoc size={20} /><span>Отметьте выход кодом. Заведение платит сотруднику напрямую; спор можно передать поддержке.</span></li>
        </ol>}
        <p className="entry-footnote">Вход через Telegram · Для сотрудников бесплатно</p>
      </main>
    </div>
  );
}
