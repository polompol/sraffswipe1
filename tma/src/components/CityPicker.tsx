import { useQuery } from "@tanstack/react-query";
import { fetchCities } from "@/api/endpoints";

/** Выбор города из списка — не поле ввода.
 *
 *  Со свободным вводом «Санкт-Петербург», «СПб» и «Питер» становились тремя
 *  разными городами: люди из одного города переставали видеть друг друга, и
 *  понять причину было невозможно — лента просто пустая, без единой ошибки.
 *
 *  Список приходит с сервера, а не лежит копией в приложении: две копии
 *  неизбежно разъезжаются, а разъехавшийся город — снова пустая лента.
 *
 *  Города, которого нет в списке, можно вписать руками (маленький посёлок
 *  тоже должен работать) — для этого datalist, а не select.
 */
export function CityPicker({
  value,
  onChange,
  label = "Город",
  hint,
}: {
  value: string;
  onChange: (city: string) => void;
  label?: string;
  hint?: string;
}) {
  const { data } = useQuery({
    queryKey: ["cities"],
    queryFn: fetchCities,
    staleTime: 24 * 60 * 60 * 1000, // список городов меняется раз в год
  });

  return (
    <>
      <label className="form-label" htmlFor="city-picker">{label}</label>
      <input
        id="city-picker"
        className="input"
        list="cities-list"
        style={{ marginBottom: hint ? 4 : 12 }}
        placeholder="Начните вводить — подскажем"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="cities-list">
        {(data ?? []).map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
      {hint && (
        <p className="hint">
          {hint}
        </p>
      )}
    </>
  );
}
