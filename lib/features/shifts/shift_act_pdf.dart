import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../data/models/employer.dart';
import '../../data/models/seeker.dart';
import '../../data/models/vacancy.dart';

/// Генерация простого «акта выполненных работ» для самозанятого (PDF).
///
/// Без ЭЦП — текстовый документ с реквизитами и местом для подписей.
class ShiftActPdf {
  static Future<void> generateAndShare({
    required Seeker seeker,
    required Employer employer,
    required Vacancy vacancy,
  }) async {
    final doc = pw.Document();
    final dateStr = DateFormat('dd.MM.yyyy').format(vacancy.date);
    final actNo = vacancy.id.hashCode.abs() % 100000;

    doc.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(36),
        build: (context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Text(
                'АКТ № $actNo',
                style: pw.TextStyle(
                    fontSize: 18, fontWeight: pw.FontWeight.bold),
              ),
              pw.Text('выполненных работ (оказанных услуг)'),
              pw.SizedBox(height: 4),
              pw.Text('г. ${seeker.city}, $dateStr'),
              pw.Divider(),
              pw.SizedBox(height: 8),
              _kv('Заказчик', employer.companyName),
              _kv('ИНН Заказчика', employer.inn),
              _kv('ОГРН', employer.ogrn),
              _kv('Адрес', employer.address),
              pw.SizedBox(height: 8),
              _kv('Исполнитель (самозанятый)', seeker.name),
              _kv('ИНН Исполнителя', seeker.inn ?? '—'),
              _kv('Статус', seeker.selfEmployed
                  ? 'Плательщик НПД (самозанятый)'
                  : 'Физическое лицо'),
              pw.SizedBox(height: 12),
              pw.Text('Предмет акта:',
                  style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
              pw.SizedBox(height: 6),
              pw.Table(
                border: pw.TableBorder.all(color: PdfColors.grey600),
                children: [
                  _tableRow(['Услуга', 'Дата', 'Время', 'Сумма, ₽'],
                      header: true),
                  _tableRow([
                    'Смена: ${vacancy.role.label}',
                    dateStr,
                    vacancy.timeLabel,
                    '${vacancy.estimatedPay}',
                  ]),
                ],
              ),
              pw.SizedBox(height: 10),
              pw.Align(
                alignment: pw.Alignment.centerRight,
                child: pw.Text(
                  'Итого к оплате: ${vacancy.estimatedPay} ₽',
                  style: pw.TextStyle(
                      fontSize: 14, fontWeight: pw.FontWeight.bold),
                ),
              ),
              pw.SizedBox(height: 8),
              pw.Text(
                'Услуги оказаны полностью и в срок. Стороны претензий '
                'друг к другу не имеют. Чек НПД формируется Исполнителем '
                'в приложении «Мой налог».',
              ),
              pw.Spacer(),
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  _signature('Заказчик', employer.companyName),
                  _signature('Исполнитель', seeker.name),
                ],
              ),
              pw.SizedBox(height: 12),
              pw.Text(
                'Документ сформирован в приложении StaffSwipe. '
                'Не является заменой чеку из «Мой налог».',
                style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
              ),
            ],
          );
        },
      ),
    );

    await Printing.sharePdf(
      bytes: await doc.save(),
      filename: 'act_${vacancy.id}.pdf',
    );
  }

  static pw.Widget _kv(String k, String v) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.SizedBox(
            width: 170,
            child: pw.Text('$k:',
                style: const pw.TextStyle(color: PdfColors.grey700)),
          ),
          pw.Expanded(child: pw.Text(v)),
        ],
      ),
    );
  }

  static pw.TableRow _tableRow(List<String> cells, {bool header = false}) {
    return pw.TableRow(
      decoration: header
          ? const pw.BoxDecoration(color: PdfColors.grey300)
          : null,
      children: cells
          .map((c) => pw.Padding(
                padding: const pw.EdgeInsets.all(6),
                child: pw.Text(
                  c,
                  style: header
                      ? pw.TextStyle(fontWeight: pw.FontWeight.bold)
                      : null,
                ),
              ))
          .toList(),
    );
  }

  static pw.Widget _signature(String role, String name) {
    return pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.start,
      children: [
        pw.Text(role, style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 24),
        pw.Container(width: 160, height: 1, color: PdfColors.black),
        pw.SizedBox(height: 2),
        pw.Text(name, style: const pw.TextStyle(fontSize: 10)),
      ],
    );
  }
}
