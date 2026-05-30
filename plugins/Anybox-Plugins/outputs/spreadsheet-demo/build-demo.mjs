import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Projects/Anybox-Plugins/outputs/spreadsheet-demo";
const outputPath = path.join(outputDir, "sales-demo.xlsx");

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Sales Demo");

workbook.setColorScheme({
  name: "Demo",
  themeColors: {
    accent1: "#2563EB",
    accent2: "#16A34A",
    accent3: "#F97316",
    dk1: "#111827",
    lt1: "#FFFFFF",
    lt2: "#E5E7EB",
    hlink: "#2563EB",
    folHlink: "#7C3AED",
  },
});

sheet.getRange("A1:F1").merge();
sheet.getRange("A1").values = [["Quarterly Sales Demo"]];
sheet.getRange("A1").format.font = { bold: true, size: 18, color: "lt1" };
sheet.getRange("A1").format.fill = "accent1";
sheet.getRange("A1").format.horizontalAlignment = "center";

sheet.getRange("A3:F3").values = [["Month", "Product", "Units", "Unit Price", "Discount", "Revenue"]];
sheet.getRange("A3:F3").format.fill = "#EAF2FF";
sheet.getRange("A3:F3").format.font = { bold: true, color: "#111827" };

sheet.getRange("A4:E9").values = [
  ["January", "Notebook", 140, 18.5, 0.05],
  ["January", "Backpack", 72, 49.0, 0.08],
  ["February", "Notebook", 165, 18.5, 0.04],
  ["February", "Backpack", 91, 49.0, 0.07],
  ["March", "Notebook", 188, 18.5, 0.03],
  ["March", "Backpack", 103, 49.0, 0.06],
];
sheet.getRange("F4:F9").formulas = [
  ["=C4*D4*(1-E4)"],
  ["=C5*D5*(1-E5)"],
  ["=C6*D6*(1-E6)"],
  ["=C7*D7*(1-E7)"],
  ["=C8*D8*(1-E8)"],
  ["=C9*D9*(1-E9)"],
];

sheet.getRange("H3:I3").merge();
sheet.getRange("H3").values = [["Summary"]];
sheet.getRange("H3").format.fill = "accent2";
sheet.getRange("H3").format.font = { bold: true, color: "lt1" };
sheet.getRange("H3").format.horizontalAlignment = "center";

sheet.getRange("H4:H7").values = [["Total Units"], ["Gross Revenue"], ["Average Discount"], ["Best Month"]];
sheet.getRange("I4:I7").formulas = [
  ["=SUM(C4:C9)"],
  ["=SUM(F4:F9)"],
  ["=AVERAGE(E4:E9)"],
  ['=INDEX(A4:A9,MATCH(MAX(F4:F9),F4:F9,0))'],
];
sheet.getRange("H4:H7").format.font = { bold: true };
sheet.getRange("H4:I7").format.fill = "#F8FAFC";

sheet.getRange("D4:D9").format.numberFormat = "$#,##0.00";
sheet.getRange("E4:E9").format.numberFormat = "0%";
sheet.getRange("F4:F9").format.numberFormat = "$#,##0.00";
sheet.getRange("I5").format.numberFormat = "$#,##0.00";
sheet.getRange("I6").format.numberFormat = "0.0%";

sheet.getRange("A3:F9").format.border = {
  top: { style: "thin", color: "#CBD5E1" },
  bottom: { style: "thin", color: "#CBD5E1" },
  left: { style: "thin", color: "#CBD5E1" },
  right: { style: "thin", color: "#CBD5E1" },
};
sheet.getRange("H3:I7").format.border = {
  top: { style: "thin", color: "#CBD5E1" },
  bottom: { style: "thin", color: "#CBD5E1" },
  left: { style: "thin", color: "#CBD5E1" },
  right: { style: "thin", color: "#CBD5E1" },
};

sheet.getRange("A11:I11").merge();
sheet.getRange("A11").values = [["This workbook was generated with values, formulas, merged cells, number formats, borders, and a styled summary block."]];
sheet.getRange("A11").format.font = { italic: true, color: "#475569" };

sheet.freezePanes.freezeRows(3);
sheet.getRange("A:F").format.columnWidthPx = 110;
sheet.getRange("B:B").format.columnWidthPx = 130;
sheet.getRange("H:I").format.columnWidthPx = 150;

const tableCheck = await workbook.inspect({
  kind: "table",
  range: "Sales Demo!A1:I11",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 9,
});
console.log(tableCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Sales Demo",
  range: "A1:I11",
  format: "png",
  scale: 2,
});
await fs.writeFile(path.join(outputDir, "sales-demo-preview.png"), Buffer.from(await preview.arrayBuffer()));

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`saved ${outputPath}`);
