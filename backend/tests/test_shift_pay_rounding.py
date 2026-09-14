"""Сумма смены совпадает с estimatedPay в приложении, включая половину рубля."""

import pytest

from app.models import Vacancy
from app.shift_rules import shift_pay


@pytest.mark.parametrize(
    ("rate", "start", "end", "actual_minutes", "expected"),
    [
        (401, 540, 1050, None, 3409),  # 3408.5: половина вверх, не к чётному.
        (399, 540, 1050, None, 3392),  # Уже нечётная целая часть.
        (241, 540, 570, None, 121),
        (401, 1200, 270, None, 3409),  # Те же 8.5 часа через полночь.
        (401, 540, 1020, 30, 201),  # Фактическое время тоже округляется.
        (401, 540, 1020, 135, 902),
        (401, 540, 1020, 0, 0),  # Ноль не подменяется плановым временем.
        (401, 540, 541, None, 7),
        (401, 540, 542, None, 13),
        (401, 540, 540, None, 9624),  # Одинаковое время означает сутки.
        (400, 540, 1020, None, 3200),
    ],
)
def test_hourly_pay_rounds_like_the_app(
    rate, start, end, actual_minutes, expected,
):
    vacancy = Vacancy(
        rate=rate, rate_type="perHour", start_time=start, end_time=end,
    )

    result = shift_pay(vacancy, actual_minutes)

    assert result == expected
    assert isinstance(result, int)


@pytest.mark.parametrize("actual_minutes", [None, 30, 510])
def test_flat_shift_pay_does_not_depend_on_hours(actual_minutes):
    vacancy = Vacancy(
        rate=4501, rate_type="perShift", start_time=540, end_time=1050,
    )

    assert shift_pay(vacancy, actual_minutes) == 4501
