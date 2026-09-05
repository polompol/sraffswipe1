// @vitest-environment jsdom
/**
 * Потеря входа должна выключать вход ЦЕЛИКОМ.
 *
 * Обработчик 401 в сетевом слое чистил localStorage и переводил хэш на
 * онбординг, но не трогал хранилище сессии в памяти: флаг authenticated
 * оставался true. А именно он в App.tsx решает, показать экран или увести на
 * онбординг — `ready ? <Page/> : <Navigate to="/onboarding"/>`.
 *
 * Получалось состояние «токена нет, но приложение считает, что вход есть»:
 * человек попадал на онбординг, а при следующем переходе снова видел рабочий
 * экран, который сыпал 401 на каждом запросе.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getToken } from "@/api/client";
import { LS } from "@/lib/storage";
import { useSession } from "./session";

describe("потеря входа", () => {
  beforeEach(() => {
    useSession.getState().setAuth("t0k3n", "seeker", "u1");
  });

  it("сбрасывает и токен, и флаг входа, и роль", () => {
    expect(useSession.getState().authenticated).toBe(true);
    useSession.getState().logout();
    const s = useSession.getState();
    expect(s.authenticated).toBe(false);
    expect(s.role).toBeNull();
    expect(s.userId).toBeNull();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(LS.role)).toBeNull();
    expect(localStorage.getItem(LS.uid)).toBeNull();
  });
});
