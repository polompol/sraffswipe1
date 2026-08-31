import type { ReactNode } from "react";
import type { Seeker } from "@/types/domain";
import {
  EXPERIENCE_TAG_LABELS,
  MED_BOOK_LABELS,
  STAFF_ROLE_LABELS,
} from "@/types/domain";
import {
  IconCheck,
  IconLike,
  IconMedBook,
  IconPin,
  IconSkip,
  IconStar,
} from "@/components/Icons";
import { dec1 } from "@/lib/format";
import { reliabilityText } from "@/lib/reliability";
import { Sheet } from "@/components/Sheet";
import { Button } from "@/components/Button";

/** «Подробнее о человеке» — то же, что шторка смены, только с другой стороны.
 *
 *  До неё у заведения глубины не было вовсе: всё, что известно о кандидате,
 *  лежало на самой карточке — рассказ о себе, перечень умений, район,
 *  медкнижка. Получалось пять строк текста на экране, где выбирают за три
 *  секунды, и при этом ни одной подробности сверх них.
 *
 *  Теперь на карточке остаётся то, чем решают (кто, кем, можно ли положиться),
 *  а рассказ и умения — здесь. Позвать можно прямо отсюда: человек всё
 *  прочитал и решил, и заставлять его закрывать шторку и заново тянуться к
 *  сердцу — ровно тот момент, когда решение остывает.
 */
export function CandidateDetailsSheet({
  s,
  onClose,
  onCall,
}: {
  s: Seeker;
  onClose: () => void;
  /** Может быть асинхронным: промис уходит в кнопку, и та держит себя
   *  заблокированной, пока приглашение не отправлено (защита от двойного тапа). */
  onCall?: (s: Seeker) => void | Promise<void>;
}) {
  const roles = s.roles ?? [];
  const tags = s.experienceTags ?? [];

  const Row = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="row" style={{ gap: 10, alignItems: "flex-start", marginTop: 12 }}>
      <span style={{ color: "var(--gold)", display: "inline-flex", marginTop: 2 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );

  return (
    <Sheet
      title={`${s.name}${s.age != null ? `, ${s.age}` : ""}`}
      onClose={onClose}
      footer={
        // Порядок и вес — как в шторке смены: главное действие заливкой и
        // справа, где легче большому пальцу; «Закрыть» тише и слева.
        onCall ? (
          <div className="row" style={{ gap: 10 }}>
            <Button
              variant="secondary"
              block={false}
              style={{ flex: "0 0 auto" }}
              icon={<IconSkip size={16} />}
              onClick={onClose}
            >
              Закрыть
            </Button>
            <Button
              block={false}
              style={{ flex: "1 1 auto", minWidth: 0 }}
              icon={<IconLike size={18} />}
              onClick={() => onCall(s)}
            >
              Позвать
            </Button>
          </div>
        ) : (
          <Button variant="secondary" icon={<IconSkip size={16} />} onClick={onClose}>
            Закрыть
          </Button>
        )
      }
    >
      {roles.length > 0 && (
        <div className="muted">{roles.map((r) => STAFF_ROLE_LABELS[r]).join(" · ")}</div>
      )}

      {/* Надёжность — первое, что хочет знать заведение: выйдет человек или
          нет. Поэтому она стоит выше умений и рассказа о себе. */}
      <Row icon={<IconCheck size={18} />}>
        <b>Можно ли положиться</b>
        <div className="muted" style={{ marginTop: 2 }}>
          {s.shiftsTotal
            ? reliabilityText(s.shiftsTotal, s.shiftsAttended, s.employersTotal)
            : "Смен на площадке пока не было"}
        </div>
      </Row>

      {/* Прочерк вместо оценки читается как «ноль»: у человека без отзывов
          звезду просто не показываем, как и на карточке. */}
      {!!s.rating && (
        <Row icon={<IconStar size={18} />}>{dec1(s.rating)}</Row>
      )}

      {s.district && <Row icon={<IconPin size={18} />}>{s.district}</Row>}

      <Row icon={<IconMedBook size={18} />}>
        <b>Медкнижка</b>
        <div className="muted" style={{ marginTop: 2 }}>
          {MED_BOOK_LABELS[s.medBook]}
          {s.selfEmployed ? " · Самозанятый" : ""}
        </div>
      </Row>

      {tags.length > 0 && (
        <Row icon={<IconCheck size={18} />}>
          <b>Что умеет</b>
          <div className="muted" style={{ marginTop: 2 }}>
            {tags.map((t) => EXPERIENCE_TAG_LABELS[t]).join(" · ")}
          </div>
        </Row>
      )}

      {s.about && (
        <div className="muted" style={{ marginTop: 14, lineHeight: 1.5 }}>{s.about}</div>
      )}

      {/* Честная оговорка вместо ложной уверенности. Документы мы не храним и
          не проверяем принципиально (152-ФЗ): всё, что здесь написано про
          медкнижку и опыт, человек указал сам. Заведение должно это знать до
          смены, а не выяснять на ней. */}
      <div className="card" style={{ marginTop: 16, background: "var(--gold-tint)", borderColor: "var(--gold)" }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ color: "var(--gold)", display: "inline-flex" }}><IconCheck size={16} /></span>
          <span className="muted">
            Медкнижку и опыт человек указывает сам — документы мы не храним.
            Попросите показать их на смене.
          </span>
        </div>
      </div>
    </Sheet>
  );
}
