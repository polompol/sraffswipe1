# Шрифты

## prata.woff2

**Prata** — антиква (шрифт с засечками) с кириллицей, автор Cyreal,
лицензия **SIL Open Font License 1.1** (свободна для коммерческого
использования, менять и продавать сам шрифт нельзя).

Источник: https://fonts.google.com/specimen/Prata
Текст лицензии: https://openfontlicense.org

Файл урезан до нужного набора знаков — русские и латинские буквы, цифры,
рубль и пунктуация: 17 КБ вместо 93 КБ исходника. Пересобрать при
необходимости:

```sh
pip install fonttools brotli
python3 -m fontTools.subset Prata.ttf \
  --text="АБВ…абв…ABC…abc…0123456789 ₽€$%№·—–…«»()[],.:;!?/@+=&*#" \
  --flavor=woff2 --layout-features='*' --output-file=prata.woff2
```

Используется только для заголовков экранов и суммы за смену
(токен `--font-display`). Остальной интерфейс — системным шрифтом.
