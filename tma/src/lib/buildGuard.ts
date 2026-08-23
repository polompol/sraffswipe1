/** БОЕВАЯ СБОРКА НЕ ДОЛЖНА СОБРАТЬСЯ СЛОМАННОЙ.
 *
 *  У фронтенда есть особенность: настройки «запекаются» в бандл на этапе
 *  сборки. Ошибся здесь — и приложение уедет на сервер молча неправильным.
 *  Оно откроется, нарисует экраны, и никакой ошибки никто не увидит; поймут
 *  через день по нулю откликов.
 *
 *  Поэтому боевая сборка (её помечает docker-compose.prod.yml переменной
 *  PROD_BUILD=1) падает сразу и с объяснением. Обычные сборки — локальная и в
 *  CI — этих проверок не касаются.
 *
 *  Проверки вынесены из vite.config.ts отдельным файлом ровно затем, чтобы их
 *  можно было прогнать тестом: предохранитель, который сам никем не проверен,
 *  однажды перестаёт срабатывать молча.
 */

/** Демо-данные вместо сервера. */
function checkBackend(env: Record<string, string | undefined>): void {
  if (env.VITE_USE_BACKEND === "true") return;
  throw new Error(
    "Боевая сборка с демо-данными: VITE_USE_BACKEND должен быть \"true\". "
    + "Проверьте args в docker-compose.prod.yml — приложение уехало бы на "
    + "сервер с выдуманными сменами.",
  );
}

/** Адрес сервера.
 *
 *  У этой переменной в tma/Dockerfile есть значение по умолчанию —
 *  http://localhost:8000. Оно правильное для работы на своей машине и
 *  катастрофическое на сервере: приложение у каждого человека стучалось бы в
 *  его собственный телефон. Экраны нарисуются, лента будет вечно пустой.
 *
 *  Вторая ловушка тише и вероятнее: в compose стоит `https://${DOMAIN}/api`.
 *  Забыли DOMAIN в .env — получается «https:///api», адрес без домена. Сборка
 *  проходит, образ создаётся, приложение не работает.
 */
function checkApiUrl(env: Record<string, string | undefined>): void {
  const raw = (env.VITE_API_BASE_URL ?? "").trim();
  const fail = (why: string): never => {
    throw new Error(
      `Боевая сборка с неверным адресом сервера (VITE_API_BASE_URL="${raw}"): `
      + `${why} Проверьте DOMAIN в .env и args в docker-compose.prod.yml.`,
    );
  };
  if (!raw) fail("адрес не задан.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("это не адрес.");
  }
  if (url.protocol !== "https:") {
    // Telegram открывает Mini App только по https, и куки/вебсокет по http
    // всё равно не поедут.
    fail("нужен https.");
  }
  if (
    url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]"
    || url.hostname.endsWith(".local")
  ) {
    fail("это адрес вашей машины, а не сервера.");
  }
  // Домен без точки — это не публичный сервер. Сюда попадает и главная
  // ловушка: «https://${DOMAIN}/api» с пустым DOMAIN превращается не в
  // ошибку, а в адрес «https://api/» — сборка проходит, образ создаётся,
  // приложение стучится в несуществующий домен.
  if (!url.hostname.includes(".")) {
    fail("это не похоже на домен — проверьте, заполнен ли DOMAIN.");
  }
}

export function assertNotDemoBuild(env: Record<string, string | undefined>): void {
  if (env.PROD_BUILD !== "1") return;
  checkBackend(env);
  checkApiUrl(env);
}
