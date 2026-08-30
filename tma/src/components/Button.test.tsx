// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  // Авто-очистки нет (тесты запускаются без общего setup-файла), иначе
  // отрисованные кнопки накапливаются и getByRole находит несколько.
  afterEach(cleanup);

  it("размер задаётся классом, и внешний style его не уносит", () => {
    // Регрессия: раньше высота писалась прямо в разметке, и внешний style шёл
    // после неё — кнопка отправки в чате схлопывалась по высоте иконки и
    // теряла минимальную зону нажатия. Теперь высота живёт в CSS-классе
    // (--btn-h-* в theme.css), и потерять её при передаче стилей нельзя.
    render(
      <Button style={{ width: 52, padding: 0 }}>
        <span>ok</span>
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn.style.width).toBe("52px"); // внешнее применилось
    expect(btn.style.padding).toBe("0px");
    expect(btn.className).toContain("ui-btn--lg"); // размер на месте
    expect(btn.style.minHeight).toBe(""); // и не продублирован в разметке
  });

  it("каждый размер ставит свой класс", () => {
    render(<Button size="sm">маленькая</Button>);
    expect(screen.getByRole("button").className).toContain("ui-btn--sm");
    cleanup();
    render(<Button size="md">средняя</Button>);
    expect(screen.getByRole("button").className).toContain("ui-btn--md");
  });

  it("блокирует повторное нажатие, пока async-обработчик не завершился", async () => {
    // Важно для денег: двойной тап не должен отправить действие дважды.
    let release: () => void = () => {};
    const onClick = vi.fn(
      () => new Promise<void>((res) => {
        release = res;
      }),
    );
    render(<Button onClick={onClick}>Оплатить</Button>);
    const btn = screen.getByRole("button");

    fireEvent.click(btn);
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  });

  it("aria-busy отражает и внутренний спиннер, а не только проп loading", async () => {
    let release: () => void = () => {};
    const onClick = () => new Promise<void>((res) => {
      release = res;
    });
    render(<Button onClick={onClick}>Отправить</Button>);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-busy")).toBe("false");

    fireEvent.click(btn);
    await waitFor(() => expect(btn.getAttribute("aria-busy")).toBe("true"));
    release();
  });

  it("не вызывает обработчик, когда кнопка отключена", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Нельзя</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
